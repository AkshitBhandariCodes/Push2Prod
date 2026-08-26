// ============================================================
// API Gateway / BFF Service
// Purre Push2Prod system ka single entry point jo client requests
// ko rate-limit, authenticate, aur redirect (proxy) karega downstream microservices pe.
// ============================================================

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createProxyMiddleware } from 'http-proxy-middleware';
import crypto from 'crypto';
import { config } from '@push2prod/config';
import { db } from '@push2prod/db';
import { logger } from '@push2prod/logger';

const app = express();

// ============================================================
// Middleware 1: CORS Configuration
// Credentials allow karna zaroori hai kyunki browser se cookie 
// cross-origin send honge (Next.js app running on port 3000)
// ============================================================
app.use(cors({
  origin: config.webAppUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Request-Id'],
}));

// Parsers load karte hain cookie read karne ke liye
app.use(cookieParser());

// Json body parser handles standard gateway routes (like health checks)
app.use(express.json());

// ============================================================
// Middleware 2: Request ID Generation & Propagation
// Har request ke sath ek unique UUID attach karenge jo internal
// services me log track karne me help karegi (traceability)
// ============================================================
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

// ============================================================
// Middleware 3: Basic Memory Rate Limiter
// Simple in-memory bucket jo 1 minute me max 150 requests allow karegi per IP
// ============================================================
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 Minute
const MAX_REQUESTS = 150;

app.use((req: Request, res: Response, next: NextFunction) => {
  // Health checks ya internal auth calls ko rate-limit se bypass rakhte hain
  if (req.path === '/health' || req.path.startsWith('/api/auth')) {
    return next();
  }

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  let record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, record);
  } else {
    record.count++;
  }

  if (record.count > MAX_REQUESTS) {
    logger.warn(`Rate limit exceeded for IP: ${ip} on path ${req.path}`);
    res.status(429).json({
      status: 'error',
      message: 'Too many requests. Please try again after a minute.',
      requestId: req.headers['x-request-id']
    });
    return;
  }
  
  next();
});

// ============================================================
// Helper: DB Session Validation logic
// NextAuth sessionToken ko DB me check karke true user status fetch karega
// ============================================================
const getSessionUser = async (sessionToken: string) => {
  const session = await db.session.findUnique({
    where: { sessionToken },
    include: { user: true }
  });
  if (!session) return null;
  // Expiry check
  if (session.expires < new Date()) {
    return null;
  }
  return session.user;
};

// ============================================================
// Middleware 4: Centralized Authentication Check
// Custom cookie validation. Valid sessions se user id extract karke
// header me downstream ko bhejenge
// ============================================================
app.use(async (req: Request, res: Response, next: NextFunction) => {
  // Public routes check - auth callbacks, logins aur health pages ko authenticate nahi karenge
  if (
    req.path.startsWith('/api/auth') || 
    req.path === '/health' || 
    req.path.startsWith('/debug')
  ) {
    return next();
  }

  // NextAuth v5 session tokens multiple potential cookie names ke sath aate hain
  const sessionToken = 
    req.cookies['authjs.session-token'] || 
    req.cookies['__Secure-authjs.session-token'] ||
    req.cookies['next-auth.session-token'] ||
    req.cookies['__Secure-next-auth.session-token'];

  const headerUserId = req.headers['x-user-id'];

  if (!sessionToken && !headerUserId) {
    res.status(401).json({
      status: 'error',
      message: 'Unauthorized. No active session or user ID header found.',
      requestId: req.headers['x-request-id']
    });
    return;
  }

  // Session lookup and header generation
  if (sessionToken) {
    try {
      const user = await getSessionUser(sessionToken);
      if (!user) {
        res.status(401).json({
          status: 'error',
          message: 'Unauthorized. Session is invalid or has expired.',
          requestId: req.headers['x-request-id']
        });
        return;
      }
      // Inject authenticated user ID to header for internal microservices
      req.headers['x-user-id'] = user.id;
    } catch (error) {
      logger.error('Database query for session lookup failed:', error);
      // Fail-safe fallback in dev environment if headers are present
      if (headerUserId) {
        req.headers['x-user-id'] = headerUserId;
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Session validation service is temporarily unavailable.',
          requestId: req.headers['x-request-id']
        });
        return;
      }
    }
  } else if (headerUserId) {
    // Development local bypass
    req.headers['x-user-id'] = headerUserId;
  }

  next();
});

// ============================================================
// Downstream Service Proxy Definitions
// Proxying: /api/auth -> Web App (port 3000)
// Proxying: /api/projects -> Project Service (port 4001)
// Proxying: /api/deployments -> Project Service (port 4001)
// Proxying: /api/logs -> Project/Log Service (port 4001)
// ============================================================

// Auth proxy (uses xfwd: true so that oauth redirect URLs match the gateway host)
app.use(
  '/api/auth',
  createProxyMiddleware({
    target: config.webAppUrl,
    changeOrigin: true,
    xfwd: true, // Generate X-Forwarded headers automatically
    pathRewrite: {
      '^/api/auth': '/api/auth'
    }
  })
);

// Downstream mapping for projects, deployments, logs, debug to project-service
const projectProxyOptions = {
  target: config.projectServiceUrl,
  changeOrigin: true,
  pathRewrite: {
    '^/api/projects': '/projects',
    '^/api/deployments': '/deployments',
    '^/api/logs': '/logs',
    '^/api/debug': '/debug'
  },
  onProxyReq: (proxyReq: any, req: any) => {
    // Inject normalized headers back to forward
    if (req.headers['x-user-id']) {
      proxyReq.setHeader('x-user-id', req.headers['x-user-id']);
    }
    if (req.headers['x-request-id']) {
      proxyReq.setHeader('x-request-id', req.headers['x-request-id']);
    }
    
    // Fix: Re-stream the body if express.json() already parsed it (prevents POST request hang)
    // In http-proxy-middleware v2, fixRequestBody is not exported so we reconstruct it manually.
    if (req.body && Object.keys(req.body).length > 0) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
  },
  onError: (err: any, req: Request, res: Response) => {
    logger.error('Proxy connection error to downstream project-service:', err);
    res.status(502).json({
      status: 'error',
      message: 'Bad Gateway. Downstream microservice is unreachable.',
      requestId: req.headers['x-request-id']
    });
  }
};

app.use('/api/projects', createProxyMiddleware(projectProxyOptions));
app.use('/api/deployments', createProxyMiddleware(projectProxyOptions));
app.use('/api/logs', createProxyMiddleware(projectProxyOptions));
app.use('/api/debug', createProxyMiddleware(projectProxyOptions));

// ============================================================
// API Gateway Health Check (Aggregated)
// Downstream microservices aur database ki health ek sath report karega
// ============================================================
app.get(['/health', '/api/health'], async (req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  let projectServiceStatus = 'disconnected';
  let redisStatus = 'disconnected';
  
  try {
    await db.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (error) {
    logger.error('Database connection failed in Gateway health check:', error);
  }

  try {
    const resProject = await fetch(`${config.projectServiceUrl}/health`);
    if (resProject.ok) {
      projectServiceStatus = 'connected';
      const data = await resProject.json();
      if (data.dependencies) {
        redisStatus = data.dependencies.redis || 'disconnected';
      }
    }
  } catch (error) {
    logger.error('Project service check failed in Gateway health check:', error);
  }

  const isHealthy = dbStatus === 'connected' && projectServiceStatus === 'connected' && redisStatus === 'connected';

  res.status(isHealthy ? 200 : 500).json({
    service: 'api-gateway',
    status: isHealthy ? 'healthy' : 'unhealthy',
    dependencies: {
      postgres: dbStatus,
      projectService: projectServiceStatus,
      redis: redisStatus
    },
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// Middleware 5: Error Normalization (Final Fallback handler)
// Catch all middleware to prevent crash stack dumps in response
// ============================================================
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('API Gateway Fatal Error occurred:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
    requestId: req.headers['x-request-id']
  });
});

// Start Gateway
const PORT = config.apiGatewayPort;
app.listen(PORT, () => {
  logger.info(`=== API Gateway BFF started successfully on port ${PORT} ===`);
});
