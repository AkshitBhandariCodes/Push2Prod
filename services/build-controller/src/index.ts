import { config } from '@vercel-pro/config';
import { logger } from '@vercel-pro/logger';
import { db } from '@vercel-pro/db';
import { createClient, RedisClientType } from 'redis';
import { processBuildJob } from './worker';
import crypto from 'crypto';

// Har worker ka ek unique ID hoga taaki pata chale kisne lock kiya hai
const WORKER_ID = `worker-${crypto.randomBytes(4).toString('hex')}`;
const STREAM_NAME = 'build-events';
const GROUP_NAME = 'build-controller-group';

const redisClient = createClient({
  url: config.redisUrl,
}) as RedisClientType;

redisClient.on('error', (err) => logger.error(`[${WORKER_ID}] Redis error:`, err));

const initRedis = async () => {
  await redisClient.connect();
  logger.info(`[${WORKER_ID}] Connected to Redis`);

  // Stream ke liye consumer group banao agar pehle se nahi hai
  try {
    // '0-0' ka matlab shuru se saare events track karna
    // MKSTREAM stream ko banata hai agar wo exist nahi karti
    await redisClient.xGroupCreate(STREAM_NAME, GROUP_NAME, '0', { MKSTREAM: true });
    logger.info(`[${WORKER_ID}] Created consumer group ${GROUP_NAME}`);
  } catch (err: any) {
    // Agar group already exists hai toh BUSYGROUP error aayega, usko ignore karo
    if (err.message && err.message.includes('BUSYGROUP')) {
      logger.info(`[${WORKER_ID}] Consumer group already exists`);
    } else {
      logger.error(`[${WORKER_ID}] Failed to create consumer group:`, err);
      throw err;
    }
  }
};

// ============================================================
// Worker Loop — Lagatar naye messages padhna aur crash handling
// ============================================================
const startWorker = async () => {
  await initRedis();
  logger.info(`[${WORKER_ID}] Build Controller started. Listening for jobs...`);

  // Yeh infinite loop lagatar Redis Stream padhega
  while (true) {
    try {
      // 1. Naye messages padho XREADGROUP se
      // Block: 5000ms matlab agar naya message nahi hai toh 5s wait karega
      const response = await redisClient.xReadGroup(
        GROUP_NAME,
        WORKER_ID,
        [{ key: STREAM_NAME, id: '>' }], // '>' ka matlab group ke liye naye (undelivered) messages
        { COUNT: 1, BLOCK: 5000 }
      );

      // 2. Agar naya message mila hai toh use process karo
      if (response && response.length > 0) {
        const stream = response[0];
        const messages = stream.messages;

        for (const message of messages) {
          const messageId = message.id;
          const payload = message.message as any;

          logger.info(`[${WORKER_ID}] Received job from stream: ${messageId}`, payload);
          
          // Phase 5: Idempotency & Processing
          await processBuildJob(payload, WORKER_ID, redisClient, messageId, STREAM_NAME, GROUP_NAME);
        }
      }

      // 3. Crash Recovery (XAUTOCLAIM) — Purane pending messages jo koi doosra worker process karte waqt crash ho gaya
      // 1 minute (60000ms) se purane pending messages ko claim karne ki koshish
      const claimRes = await redisClient.xAutoClaim(
        STREAM_NAME,
        GROUP_NAME,
        WORKER_ID,
        60000, 
        '0-0', // Shuru se claim karna check karo
        { COUNT: 1 }
      );

      if (claimRes && claimRes.messages && claimRes.messages.length > 0) {
        for (const message of claimRes.messages) {
          const messageId = message.id;
          const payload = message.message as any;

          logger.warn(`[${WORKER_ID}] Auto-claimed pending job: ${messageId}`);
          await processBuildJob(payload, WORKER_ID, redisClient, messageId, STREAM_NAME, GROUP_NAME);
        }
      }

    } catch (error) {
      logger.error(`[${WORKER_ID}] Error in worker loop:`, error);
      // Wait before retrying to prevent CPU spin
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
};

startWorker().catch((err) => {
  logger.error('Worker failed to start:', err);
  process.exit(1);
});
