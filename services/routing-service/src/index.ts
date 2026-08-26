import express from 'express';
import cors from 'cors';
import { createClient } from 'redis';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { db } from '@push2prod/db';
import { config } from '@push2prod/config';
import { logger } from '@push2prod/logger';
import mime from 'mime-types';
import path from 'path';

const app = express();
app.use(cors());

// Initialize Redis for cache-aside
const redisClient = createClient({ url: config.redisUrl });
redisClient.on('error', (err) => logger.error('Redis Client Error in Routing Service', err));
redisClient.connect().then(() => logger.info('Connected to Redis for routing cache.'));

// Initialize S3 Client
const s3Client = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  forcePathStyle: config.s3.forcePathStyle,
});

const BUCKET_NAME = config.s3.bucketName;

/**
 * Scans S3 to find where index.html lives for a given prefix.
 * Fallback for legacy deployments.
 */
async function detectServeDirFromS3(prefix: string): Promise<string> {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix + '/',
    });
    const response = await s3Client.send(command);
    if (!response.Contents) return '';

    const htmlFiles = response.Contents
      .map((c) => c.Key || '')
      .filter((k) => k.endsWith('index.html'));

    if (htmlFiles.length === 0) return '';

    // Prefer shortest path (e.g., public/index.html over public/admin/index.html)
    htmlFiles.sort((a, b) => a.length - b.length);
    const bestMatch = htmlFiles[0];

    // e.g. bestMatch: "deployments/<id>/public/index.html"
    // Remove prefix and "index.html"
    let relative = bestMatch.substring(prefix.length);
    if (relative.startsWith('/')) relative = relative.substring(1);
    if (relative.endsWith('index.html')) relative = relative.substring(0, relative.length - 10);
    if (relative.endsWith('/')) relative = relative.substring(0, relative.length - 1);
    
    return relative;
  } catch (error) {
    logger.error(`Error detecting serve dir from S3 for ${prefix}:`, error);
    return '';
  }
}

/**
 * Resolves the slug to { artifactPrefix, serveDir }, using Redis as cache.
 * artifactPrefix: S3 key base, e.g. 'deployments/<id>'
 * serveDir: sub-path where index.html lives, e.g. '' or 'public'
 */
async function resolveSlugToServeRoot(slug: string): Promise<{ prefix: string; serveDir: string } | null> {
  const cacheKey = `route:${slug}`;
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }

  // Find project and its latest successful deployment
  const project = await db.project.findUnique({
    where: { slug },
    include: {
      deployments: {
        where: { status: 'READY', artifactPrefix: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      }
    }
  });

  if (!project || project.deployments.length === 0) {
    return null;
  }

  const dep = project.deployments[0];
  if (!dep.artifactPrefix) return null;

  let serveDir = dep.serveDir ?? null;

  // serveDir is NULL â†’ this is a legacy deployment (built before auto-detection was added)
  // Scan S3 to find where index.html actually lives and persist it for next time
  if (serveDir === null) {
    serveDir = await detectServeDirFromS3(dep.artifactPrefix);
    // Persist back to DB so we don't scan on every request
    try {
      await db.deployment.update({
        where: { id: dep.id },
        data: { serveDir },
      });
    } catch { /* non-critical */ }
  }

  const result = {
    prefix: dep.artifactPrefix,
    serveDir: serveDir ?? '',
  };

  // Cache for 60 seconds
  await redisClient.setEx(cacheKey, 60, JSON.stringify(result));
  return result;
}

/**
 * Build the full S3 key for a file request, respecting serveDir.
 * serveDir=''       â†’ deployments/<id>/index.html
 * serveDir='public' â†’ deployments/<id>/public/index.html
 */
function buildS3Key(prefix: string, serveDir: string, filePath: string): string {
  const servePath = serveDir ? `${prefix}/${serveDir}` : prefix;
  return `${servePath}/${filePath}`.replace(/\/+/g, '/');
}

/**
 * Core routing middleware
 */

// Handle wildcard subdomains like [slug].localhost:4002
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (host.includes('.localhost:4002')) {
    const slug = host.split('.')[0];
    if (req.url === '/') {
      req.url = `/site/${slug}/`;
    } else {
      req.url = `/site/${slug}${req.url}`;
    }
  }
  next();
});

app.get('/site/:slug/*', async (req, res) => {
  const { slug } = req.params;
  // req.params[0] captures the wildcard part after /site/:slug/
  let filePath = (req.params as any)[0] || 'index.html';
  if (!filePath || filePath === '/') filePath = 'index.html';

  try {
    const serveRoot = await resolveSlugToServeRoot(slug);
    if (!serveRoot) {
      return res.status(404).send('Project not found or no successful deployment available.');
    }

    const { prefix, serveDir } = serveRoot;
    const s3Key = buildS3Key(prefix, serveDir, filePath);

    try {
      // Try to fetch the requested file
      const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
      const s3Response = await s3Client.send(command);

      const contentType = mime.lookup(filePath) || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      if (s3Response.Body) {
        (s3Response.Body as NodeJS.ReadableStream).pipe(res);
      } else {
        res.status(500).send('Empty file body from S3.');
      }
    } catch (s3Error: any) {
      // If file not found, implement SPA fallback
      if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
        // If the path has an extension (like .js, .css, .png) â†’ real missing asset â†’ 404
        if (path.extname(filePath)) {
          return res.status(404).send('File not found.');
        }

        // SPA Fallback: any non-extension path (client-side route) â†’ serve index.html
        const fallbackKey = buildS3Key(prefix, serveDir, 'index.html');
        try {
          const fallbackCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fallbackKey });
          const fallbackResponse = await s3Client.send(fallbackCommand);

          res.setHeader('Content-Type', 'text/html');
          if (fallbackResponse.Body) {
            (fallbackResponse.Body as NodeJS.ReadableStream).pipe(res);
          }
        } catch (fallbackError) {
          return res.status(404).send('Not Found: index.html missing from deployment artifacts.');
        }
      } else {
        logger.error(`S3 fetch error for key ${s3Key}:`, s3Error);
        return res.status(500).send('Internal Server Error fetching from storage.');
      }
    }

  } catch (error) {
    logger.error('Routing Service Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// For pure /site/:slug (no trailing slash)
app.get('/site/:slug', (req, res) => {
  res.redirect(`/site/${req.params.slug}/`);
});

const PORT = 4002;
app.listen(PORT, () => {
  logger.info(`Routing Service is running on http://localhost:${PORT}`);
});
