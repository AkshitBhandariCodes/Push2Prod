import { Router, Request, Response } from 'express';
import { db } from '@vercel-pro/db';
import { logger } from '@vercel-pro/logger';

const router = Router();

// ============================================================
// GET /deployments/:id/logs — Fetch build logs for a deployment
// ============================================================
router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const { id: deploymentId } = req.params;

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

export default router;
