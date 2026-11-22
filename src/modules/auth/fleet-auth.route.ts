import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { InitiateSignupSchema, LoginSchema } from './auth.validation';
import {
  fleetInitiateSignupHandler,
  fleetLoginHandler,
} from './fleet-auth.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Fleet Manager Auth Router
// Mounted at: /api/v1/auth/fleet
//
// NOTE: Fleet Managers reuse the shared endpoints for OTP verification and session mgmt:
//   - POST /api/v1/auth/signup/resend-otp
//   - POST /api/v1/auth/signup/verify-otp
//   - POST /api/v1/auth/refresh-token
//   - POST /api/v1/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

const router: Router = Router();

router.post(
  '/signup/initiate',
  validate({ body: InitiateSignupSchema }),
  fleetInitiateSignupHandler,
);

router.post(
  '/login',
  validate({ body: LoginSchema }),
  fleetLoginHandler,
);

export default router;
