import compression from 'compression';
import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { NotFoundError } from './utils/errors';

// ─── Route Imports ────────────────────────────────────────────────────────────
import driversRouter from './domains/drivers/drivers.routes';
import kycRouter from './domains/kyc/kyc.routes';
import notificationsRouter from './domains/notifications/notifications.routes';
import profileRouter from './domains/profile/profile.routes';
import promotionsRouter from './domains/promotions/promotions.routes';
import reviewsRouter from './domains/reviews/reviews.routes';
import ridesRouter from './domains/rides/rides.routes';
import safetyRouter from './domains/safety/safety.routes';
import supportRouter from './domains/support/support.routes';
import vehicleRouter from './domains/vehicle/vehicle.routes';
import adminRouter from './domains/admin/admin.routes';
import customersRouter from './domains/customers/customers.routes';

// ── Inline micro-router for /api/v1/users ────────────────────────────────────
// Keeps the users-related endpoints (e.g. FCM token) without needing a
// full domain folder for a single route.
import { Router } from 'express';
import { requireAuth } from './middlewares/mockAuth';
import { saveFcmTokenHandler } from './domains/notifications/notifications.controller';
const usersRouter = Router();
/** PATCH /api/v1/users/fcm-token — save/replace FCM push token (any role) */
usersRouter.patch('/fcm-token', requireAuth, saveFcmTokenHandler);

// ─────────────────────────────────────────────────────────────────────────────
// Express Application Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createApp(): Application {
  const app = express();

  // ── Security Headers (helmet) ──────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
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
      allowedHeaders: ['Content-Type', 'Authorization', 'x-mock-user-id', 'x-mock-role'],
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
    res.status(200).json({
      success: true,
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

  // ── Domain Routers ────────────────────────────────────────────────────────
  app.use(`${API_PREFIX}/rides`, ridesRouter);
  app.use(`${API_PREFIX}/drivers`, driversRouter);
  app.use(`${API_PREFIX}/vehicles`, vehicleRouter);
  app.use(`${API_PREFIX}/profile`, profileRouter);
  app.use(`${API_PREFIX}/kyc`, kycRouter);
  app.use(`${API_PREFIX}/notifications`, notificationsRouter);
  app.use(`${API_PREFIX}/promotions`, promotionsRouter);
  app.use(`${API_PREFIX}/reviews`, reviewsRouter);
  app.use(`${API_PREFIX}/support`, supportRouter);
  app.use(`${API_PREFIX}/safety`, safetyRouter);
  app.use(`${API_PREFIX}/users`, usersRouter);
  app.use(`${API_PREFIX}/admin`, adminRouter);
  app.use(`${API_PREFIX}/customers`, customersRouter);

  // Registers routes will be here
  // API root — health / welcome
  app.get(`${API_PREFIX}`, (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
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
