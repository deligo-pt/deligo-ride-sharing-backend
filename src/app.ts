import compression from 'compression';
import cors from 'cors';
import cooikieParser from 'cookie-parser';
import express, { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { config } from './config';
import { errorHandler } from './middlewares/errorHandler';
import { NotFoundError } from './utils/errors';

import apiRouter from './routes';
import { sendResponse } from './utils/sendResponse';
import { generalRateLimiter } from './middlewares/rateLimiter';

// ─────────────────────────────────────────────────────────────────────────────
// Express Application Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createApp(): Application {
  const app = express();

  // ── Security Headers (helmet) ──────────────────────────────────────────────
  app.use(cooikieParser());
  app.use(helmet());
  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = config.cors.allowedOrigins;
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS policy: origin ${origin} not allowed`));
        }
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    }),
  );

  // ── Body Parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── Response Compression ──────────────────────────────────────────────────
  app.use(compression());

  // ── Trust Proxy (required when behind nginx / load balancer) ──────────────
  app.set('trust proxy', 1);

  // ── Health Check ──────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Service is healthy',
      data: {
        status: 'ok',
        environment: env.NODE_ENV,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    });
  });

  // ── API Routes ────────────────────────────────────────────────────────────
  const API_PREFIX = '/api/v1';

  // General per-IP rate limit for the whole API (health checks live outside this prefix)
  app.use(API_PREFIX, generalRateLimiter);

  // ── Domain Routers (registry: src/routes/index.ts) ────────────────────────
  app.use(API_PREFIX, apiRouter);

  // API root — health / welcome
  app.get(`${API_PREFIX}`, (_req: Request, res: Response) => {
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Ride-Sharing API v1 is running',
      data: { message: 'Ride-Sharing API v1 is running 🚀' },
    });
  });

  // ── 404 Handler ───────────────────────────────────────────────────────────
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError('Route'));
  });

  // ── Global Error Handler ──────────────────────────────────────────────────
  // Must be the LAST middleware registered
  app.use(errorHandler);

  return app;
}
