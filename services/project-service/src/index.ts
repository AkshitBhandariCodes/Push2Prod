// ============================================================
// Project Service — Express API Gateway
// Ye service saare project-related endpoints handle karti hai
// Config ko sabse pehle import karte hain taaki .env variables load ho sakein
// ============================================================

import { config } from '@vercel-pro/config';
import { logger } from '@vercel-pro/logger';

import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';

// Route handlers import — har route file ek specific feature handle karti hai
import debugRouter from './routes/debug';
import projectsRouter from './routes/projects';
import { createDeployRouter } from './routes/deploy';

// Express app initialize kar rahe hain
const app = express();

// Middleware setup:
// cors() — frontend (port 3000) se backend (port 4001) par requests allow karne ke liye
// express.json() — incoming JSON request bodies ko automatically parse karega
app.use(cors());
app.use(express.json());

// ============================================================
// Database Connection Pool
// pg Pool use karte hain health check ke liye — Prisma ORM queries ke liye @vercel-pro/db use hota hai
// ============================================================
const pgPool = new Pool({
  connectionString: config.databaseUrl,
});

// ============================================================
// Redis Client Setup
// Redis ko cache aur message queue (Streams) ke liye use karte hain
// Type assertion isliye hai taaki XADD jaisi commands ka TypeScript type sahi aaye
// ============================================================
const redisClient = createClient({
  url: config.redisUrl,
}) as RedisClientType;

// Redis connection errors ko log karo — ye background mein fire hota rahega agar Redis offline hai
redisClient.on('error', (err) => logger.error('Redis connection error', err));

// ============================================================
// Route Mounting
// Har feature ka apna router hai jo specific URL prefix par mount hota hai
// ============================================================

// Debug routes — /debug/db-counts (development ke liye table counts)
app.use('/debug', debugRouter);

// Project CRUD routes — /projects (create, list, detail)
app.use('/projects', projectsRouter);

// Deploy routes — /projects/:id/deploy, /projects/:id/deployments
// createDeployRouter ek factory function hai jo redisClient accept karta hai
// (taaki deploy route Redis Stream mein XADD kar sake)
app.use('/projects', createDeployRouter(redisClient));

// ============================================================
// Health Check Endpoint
// Frontend aur monitoring tools ye endpoint use karke service ki health check karte hain
// Ye DB aur Redis dono ki connectivity verify karta hai
// ============================================================
app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let redisStatus = 'disconnected';

  // PostgreSQL health check — simple SELECT NOW() query chalate hain
  try {
    const dbResult = await pgPool.query('SELECT NOW()');
    if (dbResult.rows.length > 0) {
      dbStatus = 'connected';
    }
  } catch (error) {
    logger.error('Database health check failed:', error);
  }

  // Redis health check — PING command bhejte hain, PONG aana chahiye
  try {
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

// ============================================================
// Server Startup
// Redis connect ko background mein chalate hain taaki server turant start ho jaye
// (Agar Redis offline hai toh bhi Express port par listen karega)
// ============================================================
const startServer = async () => {
  // Redis client.connect() ko await nahi karenge — background mein connect hoga
  // Isse humara express server turant start ho jayega
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
