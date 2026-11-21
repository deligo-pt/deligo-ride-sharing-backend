import { Router } from 'express';
import { validate } from '../../../middlewares/validate';
import { InitiateSignupSchema, LoginSchema } from '../auth.validation';
import {
  driverInitiateSignupHandler,
  driverLoginHandler,
} from './driverAuth.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Driver Auth Router
// Mounted at: /api/v1/auth/driver
//
// NOTE: Drivers reuse the shared endpoints for OTP verification and session mgmt:
//   - POST /api/v1/auth/signup/resend-otp
//   - POST /api/v1/auth/signup/verify-otp
//   - POST /api/v1/auth/refresh-token
//   - POST /api/v1/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

router.post(
  '/signup/initiate',
  validate({ body: InitiateSignupSchema }),
  driverInitiateSignupHandler,
);

router.post(
  '/login',
  validate({ body: LoginSchema }),
  driverLoginHandler,
);

export default router;
