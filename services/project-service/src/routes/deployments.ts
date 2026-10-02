import { Router, Request, Response } from 'express';
import { db } from '@push2prod/db';
import { logger } from '@push2prod/logger';
import { emptyS3Directory, BUCKET_NAME } from '../s3';

const router = Router();

// ============================================================
// GET /deployments/:id/logs â€” Fetch build logs for a deployment
// ============================================================
router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const { id: deploymentId } = req.params;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      res.status(401).json({ status: 'error', message: 'Unauthorized' });
      return;
    }

    // Step 1: Validate deployment aur project ownership check
    const deployment = await db.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: true }
    });

    if (!deployment || deployment.project.userId !== userId) {
      res.status(404).json({
        status: 'error',
        message: 'Deployment not found or unauthorized',
      });
      return;
    }

    // Fetch logs ordered by creation time
    const logs = await db.buildLog.findMany({
      where: { deploymentId },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      status: 'success',
      logs,
    });
  } catch (error) {
    logger.error('Failed to fetch deployment logs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch deployment logs',
    });
  }
});

// ============================================================
// POST /deployments/:id/cancel â€” Cancel an ongoing deployment
// ============================================================
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id: deploymentId } = req.params;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      res.status(401).json({ status: 'error', message: 'Unauthorized' });
      return;
    }

    // Step 1: Validate deployment and ownership
    const deployment = await db.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: true }
    });

    if (!deployment || deployment.project.userId !== userId) {
      res.status(404).json({ status: 'error', message: 'Deployment not found or unauthorized' });
      return;
    }

    // Check if it can be cancelled
    if (['READY', 'ERROR', 'CANCELLED'].includes(deployment.status)) {
      res.status(400).json({ status: 'error', message: `Cannot cancel a deployment in ${deployment.status} state` });
      return;
    }

    // Step 2: Mark as CANCELLED
    await db.deployment.update({
      where: { id: deploymentId },
      data: { status: 'CANCELLED' }
    });

    // Also add a build log to show it was cancelled
    await db.buildLog.create({
      data: {
        deploymentId,
        message: 'Deployment was cancelled by the user.',
      }
    });

    logger.info(`Deployment ${deploymentId} cancelled by user`);
    res.json({ status: 'success', message: 'Deployment cancelled successfully' });
  } catch (error) {
    logger.error('Failed to cancel deployment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to cancel deployment' });
  }
});

// ============================================================
// DELETE /deployments/:id — Delete a deployment and purge its S3 artifacts
// ============================================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id: deploymentId } = req.params;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      res.status(401).json({ status: 'error', message: 'Unauthorized' });
      return;
    }

    const deployment = await db.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: true }
    });

    if (!deployment || deployment.project.userId !== userId) {
      res.status(404).json({ status: 'error', message: 'Deployment not found or unauthorized' });
      return;
    }

    const prefix = deployment.artifactPrefix || `deployments/${deploymentId}`;

    // Delete from DB (Prisma cascade removes logs and events)
    await db.deployment.delete({
      where: { id: deploymentId }
    });

    // Delete S3 files to free storage
    try {
      await emptyS3Directory(BUCKET_NAME, prefix);
      logger.info(`Purged S3 artifacts for deployment ${deploymentId} under '${prefix}'`);
    } catch (s3Error) {
      logger.error(`Failed to delete S3 artifacts for deployment ${deploymentId}:`, s3Error);
    }

    res.json({ status: 'success', message: 'Deployment deleted successfully and storage freed' });
  } catch (error) {
    logger.error('Failed to delete deployment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete deployment' });
  }
});

export default router;
