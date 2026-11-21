import { Router } from 'express';
import { authenticate, requireRole } from '../../../middlewares/auth';
import { validate } from '../../../middlewares/validate';
import { LoginSchema } from '../auth.validation';
import { CreateAdminSchema, SetAdminPasswordSchema } from './adminAuth.validation';
import {
  adminLoginHandler,
  createAdminHandler,
  setAdminPasswordHandler,
} from './adminAuth.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Auth Router
// Mounted at: /api/v1/auth/admin
//
// NOTE: Admins reuse the shared endpoints for session management:
//   - POST /api/v1/auth/refresh-token
//   - POST /api/v1/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

router.post(
  '/login',
  validate({ body: LoginSchema }),
  adminLoginHandler,
);

router.post(
  '/create',
  authenticate,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validate({ body: CreateAdminSchema }),
  createAdminHandler,
);

router.post(
  '/set-password',
  validate({ body: SetAdminPasswordSchema }),
  setAdminPasswordHandler,
);

export default router;
