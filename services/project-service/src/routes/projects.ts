import { Router, Request, Response } from 'express';
import { db } from '@push2prod/db';
import { logger } from '@push2prod/logger';
import { CreateProjectInputSchema } from '@push2prod/contracts';
import { ZodError } from 'zod';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { config } from '@push2prod/config';

// Initialize S3 Client for deleting artifacts
const s3Client = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  forcePathStyle: config.s3.forcePathStyle, // Required for MinIO
});
const BUCKET_NAME = config.s3.bucketName;

async function emptyS3Directory(bucket: string, dir: string) {
  const listParams = { Bucket: bucket, Prefix: dir, ContinuationToken: undefined as string | undefined };
  let listedObjects;
  do {
    listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));

    if (listedObjects.Contents && listedObjects.Contents.length > 0) {
      const deleteParams = {
        Bucket: bucket,
        Delete: { Objects: [] as any[] }
      };

      listedObjects.Contents.forEach(({ Key }) => {
        deleteParams.Delete.Objects.push({ Key });
      });

      await s3Client.send(new DeleteObjectsCommand(deleteParams));
    }
    listParams.ContinuationToken = listedObjects.NextContinuationToken;
  } while (listedObjects.IsTruncated);
}

// Projects router â€” project CRUD ke saare endpoints yahan hain
const router = Router();

// ============================================================
// POST /projects â€” Naya project create karo
// Frontend form submit karega -> ye endpoint data validate karke DB mein insert karega
// Agar slug duplicate hoga toh Prisma unique constraint error aayega
// ============================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ status: 'error', message: 'Unauthorized. User ID is required.' });
      return;
    }

    // Step 1: Zod se incoming request body validate karo
    const validatedData = CreateProjectInputSchema.parse(req.body);

    // Step 2: Project create karo DB mein â€” Prisma automatically unique slug check karega
    const project = await db.project.create({
      data: {
        name: validatedData.name,
        slug: validatedData.slug,
        repositoryUrl: validatedData.repositoryUrl || null,
        branch: validatedData.branch,
        buildCommand: validatedData.buildCommand,
        outputDir: validatedData.outputDir,
        rootDir: validatedData.rootDir,
        userId: userId,
        envVars: validatedData.envVars && validatedData.envVars.length > 0 ? {
          create: validatedData.envVars
        } : undefined,
      },
      include: {
        envVars: true // Optionally return created envVars
      }
    });

    logger.info(`Project created: ${project.slug} (${project.id}) with ${project.envVars?.length || 0} env vars`);

    // 201 Created response â€” naya resource successfully bana
    res.status(201).json({
      status: 'success',
      project,
    });
  } catch (error) {
    // Zod validation errors â€” field-level errors ko clean format mein bhejte hain
    if (error instanceof ZodError) {
      logger.warn('Project creation validation failed:', error.errors);
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    // Prisma unique constraint violation â€” duplicate slug ka case
    if (
      error instanceof Error &&
      'code' in error &&
      (error as any).code === 'P2002'
    ) {
      logger.warn('Duplicate slug attempted:', req.body.slug);
      res.status(409).json({
        status: 'error',
        message: 'A project with this slug already exists. Please choose a different slug.',
      });
      return;
    }

    // Unexpected errors â€” log karo aur generic 500 bhejo
    logger.error('Project creation failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while creating project',
    });
  }
});

// ============================================================
// GET /projects â€” Saare projects ki list return karo
// Frontend dashboard par ye list dikhegi with deployment counts
// ============================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ status: 'error', message: 'Unauthorized.' });
      return;
    }

    // Saare projects fetch karo with deployment count â€” latest pehle aayega
    const projects = await db.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { deployments: true },
        },
      },
    });

    res.json({
      status: 'success',
      projects,
    });
  } catch (error) {
    logger.error('Failed to fetch projects list:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch projects',
    });
  }
});

// ============================================================
// GET /projects/:id â€” Ek specific project ki poori detail return karo
// Project detail page par ye data dikhega â€” build config, recent deployments sab
// ============================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      res.status(401).json({ status: 'error', message: 'Unauthorized.' });
      return;
    }

    // Project ko uski recent deployments ke saath fetch karo
    // include se related deployment data bhi ek hi query mein aa jaata hai (SQL JOIN jaisa)
    const project = await db.project.findUnique({
      where: { id, userId },
      include: {
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Sirf last 10 deployments dikhayenge (performance ke liye)
        },
        _count: {
          select: { deployments: true },
        },
      },
    });

    // Agar project nahi mila toh 404 bhejo
    if (!project) {
      res.status(404).json({
        status: 'error',
        message: 'Project not found',
      });
      return;
    }

    res.json({
      status: 'success',
      project,
    });
  } catch (error) {
    logger.error('Failed to fetch project detail:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch project details',
    });
  }
});
// ============================================================
// DELETE /projects/:id â€” Ek project aur uska saara data delete karo
// ============================================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      res.status(401).json({ status: 'error', message: 'Unauthorized.' });
      return;
    }

    // Delete project (Prisma Cascade will delete deployments, logs, env vars)
    // using where: { id, userId } ensures only the owner can delete it
    // But Prisma's delete doesn't support multiple where clauses if they are not a unique index together.
    // Wait, id is the primary key. We should first verify ownership, or use deleteMany.
    const project = await db.project.findUnique({
      where: { id }
    });

    if (!project) {
      res.status(404).json({ status: 'error', message: 'Project not found' });
      return;
    }

    if (project.userId !== userId) {
      res.status(403).json({ status: 'error', message: 'Forbidden: You do not own this project.' });
      return;
    }

    await db.project.delete({
      where: { id }
    });

    // Cleanup S3 artifacts for this project
    try {
      await emptyS3Directory(BUCKET_NAME, `projects/${id}/`);
      logger.info(`S3 artifacts for project ${id} deleted successfully.`);
    } catch (s3Error) {
      logger.error(`Failed to delete S3 artifacts for project ${id}:`, s3Error);
      // We don't fail the response since DB deletion succeeded.
    }

    logger.info(`Project deleted: ${project.slug} (${project.id})`);
    res.json({ status: 'success', message: 'Project deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete project:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete project' });
  }
});

// ============================================================
// Phase 10: ENVIRONMENT VARIABLES
// ============================================================

// GET /projects/:id/env â€” List all environment variables
router.get('/:id/env', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const envVars = await db.projectEnvVar.findMany({
      where: { projectId: id },
      orderBy: { key: 'asc' },
    });
    res.json({ status: 'success', envVars });
  } catch (error) {
    logger.error('Failed to fetch env vars:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch env vars' });
  }
});

// POST /projects/:id/env â€” Create or Update an environment variable
router.post('/:id/env', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { key, value } = req.body;
    
    if (!key || typeof value !== 'string') {
      res.status(400).json({ status: 'error', message: 'Key and value are required' });
      return;
    }

    // Upsert logic: if it exists, update it; otherwise create it
    const envVar = await db.projectEnvVar.upsert({
      where: { projectId_key: { projectId: id, key } },
      update: { value },
      create: { projectId: id, key, value },
    });

    res.json({ status: 'success', envVar });
  } catch (error) {
    logger.error('Failed to save env var:', error);
    res.status(500).json({ status: 'error', message: 'Failed to save env var' });
  }
});

// DELETE /projects/:id/env/:key â€” Delete an environment variable
router.delete('/:id/env/:key', async (req: Request, res: Response) => {
  try {
    const { id, key } = req.params;
    
    await db.projectEnvVar.delete({
      where: { projectId_key: { projectId: id, key } },
    });

    res.json({ status: 'success' });
  } catch (error) {
    logger.error('Failed to delete env var:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete env var' });
  }
});

export default router;
