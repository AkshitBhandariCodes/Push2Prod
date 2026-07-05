// Monorepo ki taqat: Config ko sabse pehle import karenge taaki env variables load ho sakein (Prisma ke start hone se pehle)
import { config } from '@vercel-pro/config';
import { logger } from '@vercel-pro/logger';

import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { createClient } from 'redis';

// Hamaare debug routes ko import kar rahe hain
import debugRouter from './routes/debug';

// Express app initialize kar rahe hain
const app = express();
app.use(cors());
app.use(express.json());

// Debug endpoints (/debug/db-counts) register kar rahe hain
app.use('/debug', debugRouter);

// Postgres ke liye connection pool bana rahe hain using Config package
const pgPool = new Pool({
  connectionString: config.databaseUrl,
});

// Redis ka client bana rahe hain using Config package
const redisClient = createClient({
  url: config.redisUrl,
});

// Redis client agar connect nahi ho paya toh log karenge, warna service crash ho sakti hai
redisClient.on('error', (err) => logger.error('Redis connection error', err));

// /health endpoint: Ye endpoint frontend ko batayega ki DB aur Redis chal rahe hain ya nahi
app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let redisStatus = 'disconnected';

  try {
    // 1. Check Postgres Connection (Sirf time laane ki simple query)
    const dbResult = await pgPool.query('SELECT NOW()');
    if (dbResult.rows.length > 0) {
      dbStatus = 'connected';
    }
  } catch (error) {
    logger.error('Database health check failed:', error);
  }

  try {
    // 2. Check Redis Connection (Ping karne pe 'PONG' aana chahiye)
    // dhyan rahe ki is code ke chalne se pehle client connect hona chahiye
    if (redisClient.isOpen) {
      const pingRes = await redisClient.ping();
      if (pingRes === 'PONG') {
        redisStatus = 'connected';
      }
    }
  } catch (error) {
    logger.error('Redis health check failed:', error);
  }

  // Response bhej rahe hain JSON format mein (API format)
  const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';
  
  res.status(isHealthy ? 200 : 500).json({
    service: 'project-service',
    status: isHealthy ? 'healthy' : 'unhealthy',
    dependencies: {
      postgres: dbStatus,
      redis: redisStatus,
    },
    timestamp: new Date().toISOString(),
  });
});

// Server start karne ka function
const startServer = async () => {
  // Redis client.connect() ko await nahi karenge. Ye background me connect hone ka try karega.
  // Isse humara express server turant start ho jayega, aur agar Redis offline hai toh background me reconnect koshish karta rahega.
  redisClient.connect()
    .then(() => {
      logger.info('Redis client connected successfully');
    })
    .catch((error) => {
      logger.error('Redis background connection failed:', error);
    });

  // Server ko port par listen karwa rahe hain
  app.listen(config.projectServicePort, () => {
    logger.info(`Project service started on port ${config.projectServicePort}`);
  });
};

startServer();
