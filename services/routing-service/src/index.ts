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
redisClient.connect()
  .then(() => logger.info('Connected to Redis for routing cache.'))
  .catch((err) => logger.error('Redis connection failed in Routing Service:', err));

// Initialize S3 Client (IAM Role support or static credentials)
const s3Config: any = {
  region: config.s3.region,
  forcePathStyle: config.s3.forcePathStyle,
};

if (config.s3.endpoint) {
  s3Config.endpoint = config.s3.endpoint;
}

if (config.s3.accessKeyId && config.s3.secretAccessKey) {
  s3Config.credentials = {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  };
}

const s3Client = new S3Client(s3Config);

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
 * Generates candidate S3 keys for a file request.
 * Handles framework differences (Next.js .next/static vs /_next/static, Vite dist, SPA routes, .html pages).
 */
function getCandidateS3Keys(prefix: string, serveDir: string, filePath: string): string[] {
  let clean = filePath.startsWith('/') ? filePath.substring(1) : filePath;
  if (clean.endsWith('/')) clean = clean.substring(0, clean.length - 1);
  const candidates: string[] = [];

  // Generate path variations (exact path, .html page, /index.html)
  const pathVariations: string[] = [];
  if (clean && clean !== 'index.html') {
    pathVariations.push(clean);
    // If no file extension (e.g. 'learn', 'about', 'team'), add .html and /index.html
    if (!path.extname(clean)) {
      pathVariations.push(`${clean}.html`);
      pathVariations.push(`${clean}/index.html`);
    }
  } else {
    pathVariations.push('index.html');
  }

  for (const p of pathVariations) {
    // 1. If serveDir is set (e.g. server/app), check there first
    if (serveDir) {
      candidates.push(`${prefix}/${serveDir}/${p}`.replace(/\/+/g, '/'));
    }

    // 2. Direct path at prefix root (e.g. deployments/<id>/learn.html)
    candidates.push(`${prefix}/${p}`.replace(/\/+/g, '/'));

    // 3. Next.js server/app or server/pages directories
    candidates.push(`${prefix}/server/app/${p}`.replace(/\/+/g, '/'));
    candidates.push(`${prefix}/server/pages/${p}`.replace(/\/+/g, '/'));

    // 4. Next.js asset mapping for _next/
    if (p.startsWith('_next/')) {
      const withoutNext = p.replace(/^_next\//, '');
      candidates.push(`${prefix}/${withoutNext}`.replace(/\/+/g, '/'));
      if (serveDir) {
        candidates.push(`${prefix}/${serveDir}/${withoutNext}`.replace(/\/+/g, '/'));
      }
    }

    // 5. public/ assets fallback
    candidates.push(`${prefix}/public/${p}`.replace(/\/+/g, '/'));
  }

  // Remove duplicates while preserving priority order
  return Array.from(new Set(candidates));
}

/**
 * Core routing middleware
 */

// Handle wildcard subdomains like [slug].localhost:4002 or [slug].<ip>.nip.io:4002
app.use((req, res, next) => {
  const host = (req.headers.host || '').split(':')[0];
  if (host.includes('.localhost') || host.includes('.nip.io')) {
    const slug = host.split('.')[0];
    if (slug) {
      // If the user visits /site/<slug>/... on the subdomain, redirect to strip it for clean URLs
      if (req.url.startsWith(`/site/${slug}`)) {
        let cleanUrl = req.url.substring(`/site/${slug}`.length);
        if (!cleanUrl.startsWith('/')) cleanUrl = '/' + cleanUrl;
        return res.redirect(301, cleanUrl);
      }

      // Internally rewrite to /site/:slug/ so Express matches existing handlers
      if (!req.url.startsWith('/site/')) {
        if (req.url === '/' || req.url === '') {
          req.url = `/site/${slug}/`;
        } else {
          req.url = `/site/${slug}${req.url.startsWith('/') ? req.url : '/' + req.url}`;
        }
      }
    }
  } else if (!req.url.startsWith('/site/')) {
    // Referer fallback: when assets like /_next/static/... or images are requested on raw IP without /site/:slug/ prefix
    const referer = req.headers.referer || '';
    const match = referer.match(/\/site\/([^/?#]+)/);
    if (match) {
      const slug = match[1];
      req.url = `/site/${slug}${req.url.startsWith('/') ? req.url : '/' + req.url}`;
    }
  }
  next();
});

async function handleServe(
  req: express.Request,
  res: express.Response,
  slug: string,
  filePath: string
) {
  if (!filePath || filePath === '/' || filePath === '') filePath = 'index.html';
  if (filePath.startsWith('/')) filePath = filePath.substring(1);

  try {
    const serveRoot = await resolveSlugToServeRoot(slug);
    if (!serveRoot) {
      return res.status(404).send('Project not found or no successful deployment available.');
    }

    const { prefix, serveDir } = serveRoot;
    const candidateKeys = getCandidateS3Keys(prefix, serveDir, filePath);

    let s3Response: any = null;
    let matchedKey = '';

    // Iterate through candidate keys until a match is found in S3
    for (const key of candidateKeys) {
      try {
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        s3Response = await s3Client.send(command);
        matchedKey = key;
        break;
      } catch (err: any) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
          continue;
        }
        logger.error(`S3 fetch error for key ${key}:`, err);
        return res.status(500).send('Internal Server Error fetching from storage.');
      }
    }

    // If an asset was successfully matched in S3, stream it
    if (s3Response && s3Response.Body) {
      const contentType = mime.lookup(filePath) || mime.lookup(matchedKey) || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      return (s3Response.Body as NodeJS.ReadableStream).pipe(res);
    }

    // Asset not found directly in S3
    // If it has a file extension (like .css, .js, .png) -> real missing asset -> return 404
    if (path.extname(filePath)) {
      return res.status(404).send(`File not found: ${filePath}`);
    }

    // SPA Fallback: client-side route (e.g. /about, /dashboard) -> serve index.html
    const fallbackCandidates = Array.from(new Set([
      serveDir ? `${prefix}/${serveDir}/index.html`.replace(/\/+/g, '/') : null,
      `${prefix}/index.html`,
      `${prefix}/server/app/index.html`,
      `${prefix}/server/pages/index.html`,
      `${prefix}/public/index.html`,
    ].filter(Boolean) as string[]));

    for (const fbKey of fallbackCandidates) {
      try {
        const fbCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fbKey });
        const fbResponse = await s3Client.send(fbCommand);
        if (fbResponse.Body) {
          res.setHeader('Content-Type', 'text/html');
          return (fbResponse.Body as NodeJS.ReadableStream).pipe(res);
        }
      } catch (fbErr: any) {
        if (fbErr.name === 'NoSuchKey' || fbErr.$metadata?.httpStatusCode === 404) {
          continue;
        }
      }
    }

    return res.status(404).send('Not Found: index.html missing from deployment artifacts.');
  } catch (error) {
    logger.error('Routing Service Error:', error);
    res.status(500).send('Internal Server Error');
  }
}

// Handle root /site/:slug (with or without trailing slash)
app.get('/site/:slug', (req, res) => {
  const { slug } = req.params;
  const originalPath = req.originalUrl.split('?')[0];

  // If the user directly visited /site/:slug without a trailing slash, redirect with 301
  if (originalPath === `/site/${slug}`) {
    const query = req.originalUrl.includes('?') ? req.originalUrl.substring(req.originalUrl.indexOf('?')) : '';
    return res.redirect(301, `/site/${slug}/${query}`);
  }

  // Otherwise, it was accessed with a trailing slash (/site/:slug/) or rewritten from subdomain
  return handleServe(req, res, slug, 'index.html');
});

// Handle wildcard file paths under /site/:slug/*
app.get('/site/:slug/*', (req, res) => {
  const { slug } = req.params;
  const filePath = (req.params as any)[0] || 'index.html';
  return handleServe(req, res, slug, filePath);
});

const PORT = 4002;
app.listen(PORT, () => {
  logger.info(`Routing Service is running on http://localhost:${PORT}`);
});
