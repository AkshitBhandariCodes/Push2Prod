import { Router, Request, Response } from 'express';
import { db } from '@push2prod/db';
import { logger } from '@push2prod/logger';
import { RedisClientType } from 'redis';

// Deploy router factory â€” redisClient ko parameter mein lega taaki XADD kar sake
// Factory pattern isliye use kar rahe hain kyunki redisClient index.ts mein create hota hai
// aur hume use yahan pass karna padta hai
export const createDeployRouter = (redisClient: RedisClientType) => {
  const router = Router();

  // ============================================================
  // POST /projects/:id/deploy â€” Deploy trigger karo
  // Step 1: Project validate karo (exists ya nahi)
  // Step 2: Deployment row create karo DB mein with QUEUED status
  // Step 3: Redis Stream mein XADD karo taaki worker (Phase 4) pick kar sake
  // Step 4: Frontend ko deploymentId aur QUEUED status return karo
  // ============================================================
  router.post('/:id/deploy', async (req: Request, res: Response) => {
    try {
      const { id: projectId } = req.params;
      const userId = req.headers['x-user-id'] as string;

      if (!userId) {
        res.status(401).json({ status: 'error', message: 'Unauthorized' });
        return;
      }

      // Step 1: Check karo ki project actually exist karta hai ya nahi aur ownership
      const project = await db.project.findUnique({
        where: { id: projectId, userId },
      });

      if (!project) {
        res.status(404).json({
          status: 'error',
          message: 'Project not found. Cannot create deployment for non-existent project.',
        });
        return;
      }

      // Step 2: Deployment row create karo with QUEUED status
      // Optional commit info request body se le sakte hain
      const deployment = await db.deployment.create({
        data: {
          projectId: project.id,
          commitHash: req.body.commitHash || null,
          commitMessage: req.body.commitMessage || `Manual deploy of ${project.name}`,
          status: 'QUEUED',
        },
      });

      logger.info(
        `Deployment created: ${deployment.id} for project ${project.slug} (QUEUED)`
      );

      // Step 3: Redis Stream mein build event XADD karo
      // XADD command ek nayi entry add karta hai Redis Stream mein
      // '*' ka matlab hai ki Redis khud unique ID generate karega (timestamp based)
      // Ye payload Phase 4 mein worker consume karega
      const streamPayload = {
        deploymentId: deployment.id,
        projectId: project.id,
        repositoryUrl: project.repositoryUrl || '',
        branch: project.branch,
        buildCommand: project.buildCommand,
        outputDir: project.outputDir,
        rootDir: project.rootDir,
        type: 'START',
        message: `Build queued for project ${project.slug}`,
      };

      // Redis XADD â€” 'build-events' naam ka stream hai, '*' auto-generates ID
      // Agar Redis connected nahi hai toh catch block mein error handle hoga
      // Lekin deployment row toh already ban chuki hai DB mein â€” so deploy request lost nahi hogi
      try {
        if (redisClient.isOpen) {
          const streamId = await redisClient.xAdd(
            'build-events', // Stream ka naam
            '*', // Auto-generated ID (timestamp-based)
            streamPayload // Key-value pairs jo stream entry mein store honge
          );
          logger.info(
            `Build event added to Redis Stream: ${streamId} for deployment ${deployment.id}`
          );
        } else {
          logger.warn(
            'Redis not connected â€” deployment created in DB but stream event not published'
          );
        }
      } catch (redisError) {
        // Redis fail hone par bhi deployment row toh safe hai DB mein
        // Worker baad mein DB se QUEUED deployments pick kar sakta hai (fallback)
        logger.error('Failed to publish to Redis Stream:', redisError);
      }

      // Step 4: Response â€” frontend ko deploymentId aur status bhejo
      res.status(201).json({
        status: 'success',
        deployment: {
          id: deployment.id,
          projectId: deployment.projectId,
          commitHash: deployment.commitHash,
          commitMessage: deployment.commitMessage,
          status: deployment.status,
          createdAt: deployment.createdAt,
        },
      });
    } catch (error) {
      logger.error('Deployment creation failed:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error while creating deployment',
      });
    }
  });

  // ============================================================
  // GET /projects/:id/deployments â€” Project ki saari deployments list karo
  // Detail page par deployments table mein ye data dikhega
  // ============================================================
  router.get('/:id/deployments', async (req: Request, res: Response) => {
    try {
      const { id: projectId } = req.params;
      const userId = req.headers['x-user-id'] as string;

      if (!userId) {
        res.status(401).json({ status: 'error', message: 'Unauthorized' });
        return;
      }

      // Pehle check karo ki project exist karta hai
      const project = await db.project.findUnique({
        where: { id: projectId, userId },
      });

      if (!project) {
        res.status(404).json({
          status: 'error',
          message: 'Project not found',
        });
        return;
      }

      // Saari deployments fetch karo â€” latest pehle
      const deployments = await db.deployment.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 20, // Performance ke liye limit â€” pagination baad mein aayega
      });

      res.json({
        status: 'success',
        deployments,
      });
    } catch (error) {
      logger.error('Failed to fetch deployments:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch deployments',
      });
    }
  });

  return router;
};
