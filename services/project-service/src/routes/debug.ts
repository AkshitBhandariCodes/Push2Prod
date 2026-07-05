import { Router } from 'express';
// Hamaare singleton database module ko import kar rahe hain
import { db } from '@vercel-pro/db';
import { logger } from '@vercel-pro/logger';

const router = Router();

// GET /debug/db-counts
// Ye route direct database se all models ke row counts nikalega aur return karega.
router.get('/db-counts', async (req, res) => {
  try {
    logger.info('Database debug endpoint hit: calculating counts');
    
    // Performance optimization: Promise.all use karke saari count queries ko parallelly chala rahe hain
    const [usersCount, projectsCount, deploymentsCount, buildLogsCount, buildEventsCount] = await Promise.all([
      db.user.count(),
      db.project.count(),
      db.deployment.count(),
      db.buildLog.count(),
      db.buildEvent.count(),
    ]);

    res.json({
      status: 'success',
      counts: {
        users: usersCount,
        projects: projectsCount,
        deployments: deploymentsCount,
        buildLogs: buildLogsCount,
        buildEvents: buildEventsCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get database counts:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database check failed. Is the Docker DB running and are migrations applied?',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
