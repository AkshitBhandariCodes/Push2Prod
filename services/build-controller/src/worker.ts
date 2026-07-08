import { db } from '@vercel-pro/db';
import { logger } from '@vercel-pro/logger';
import { RedisClientType } from 'redis';
import { performCloneAndBuild } from './build';

const MAX_ATTEMPTS = 3;

export const processBuildJob = async (
  payload: any,
  workerId: string,
  redisClient: RedisClientType,
  messageId: string,
  streamName: string,
  groupName: string
) => {
  const { deploymentId, repositoryUrl, branch, buildCommand, outputDir, rootDir } = payload;

  try {
    // 1. Fetch current deployment to check idempotency and attempt counts
    const deployment = await db.deployment.findUnique({
      where: { id: deploymentId }
    });

    if (!deployment) {
      logger.warn(`[${workerId}] Deployment ${deploymentId} not found in DB. Skipping.`);
      await redisClient.xAck(streamName, groupName, messageId);
      return;
    }

    // 2. Idempotency Check: Agar already complete ho chuka hai toh wapas mat karo
    if (deployment.status === 'READY' || deployment.status === 'ERROR' || deployment.status === 'CANCELLED') {
      logger.info(`[${workerId}] Deployment ${deploymentId} is already ${deployment.status}. Acknowledging.`);
      await redisClient.xAck(streamName, groupName, messageId);
      return;
    }

    // 3. Max Attempts Check: Agar bohot baar fail ho chuka hai toh DEAD_LETTER mark karo
    if (deployment.attemptCount >= MAX_ATTEMPTS) {
      logger.error(`[${workerId}] Deployment ${deploymentId} exceeded max attempts (${MAX_ATTEMPTS}). Marking as ERROR.`);
      await db.deployment.update({
        where: { id: deploymentId },
        data: { status: 'ERROR', lastError: 'Max retry attempts exceeded.' }
      });
      await redisClient.xAck(streamName, groupName, messageId);
      return;
    }

    // 4. Lock the deployment: DB mein update karo ki ye worker kaam kar raha hai
    await db.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'BUILDING',
        lockedBy: workerId,
        lockedUntil: new Date(Date.now() + 10 * 60000), // 10 minutes lock
        attemptCount: { increment: 1 } // Har try par counter badhao
      }
    });

    logger.info(`[${workerId}] Locked deployment ${deploymentId} (Attempt ${deployment.attemptCount + 1})`);

    // 5. Phase 6 & 7: Actual Clone & Build process
    const buildSuccess = await performCloneAndBuild({
      deploymentId,
      repositoryUrl,
      branch,
      buildCommand,
      outputDir,
      rootDir,
      workerId
    });

    // 6. DB Update on completion
    await db.deployment.update({
      where: { id: deploymentId },
      data: {
        status: buildSuccess ? 'READY' : 'ERROR',
        lockedBy: null, // Unlock
        lockedUntil: null
      }
    });

    // 7. Sab kuch theek raha toh message XACK kar do (Queue se hata do)
    await redisClient.xAck(streamName, groupName, messageId);
    logger.info(`[${workerId}] Successfully processed and acknowledged ${deploymentId}`);

  } catch (error: any) {
    logger.error(`[${workerId}] Failed to process deployment ${deploymentId}:`, error);
    
    // Sirf error DB mein update karo, message abhi bhi pending rahega (XACK nahi bhej rahe)
    // Agli baar XAUTOCLAIM isko pick karega
    try {
      await db.deployment.update({
        where: { id: deploymentId },
        data: {
          lastError: error.message || 'Unknown processing error',
          status: 'QUEUED', // Re-queue in DB state
          lockedBy: null,
          lockedUntil: null
        }
      });
    } catch (dbErr) {
      logger.error(`[${workerId}] Failed to update DB on error for ${deploymentId}:`, dbErr);
    }
  }
};
