import { Router } from 'express';
import { optionalAuthenticate } from '../../middlewares/auth';
import { authRateLimiter } from '../../middlewares/rateLimiter';
import { validateRequest } from '../../middlewares/validateRequest';
import { AuthController } from './auth.controller';
import { AuthValidation } from './auth.validation';
import driverAuthRouter from './driver-auth.route';
import adminAuthRouter from './admin-auth.route';
import fleetAuthRouter from './fleet-auth.route';

// Mounted at: /api/v1/auth (see src/routes/index.ts)
const router: Router = Router();

// ── Driver, Admin & Fleet Auth Sub-Routers ────────────────────────────────────
router.use('/driver', authRateLimiter, driverAuthRouter);
router.use('/admin', authRateLimiter, adminAuthRouter);
router.use('/fleet', authRateLimiter, fleetAuthRouter);
router.use('/fleet-manager', authRateLimiter, fleetAuthRouter);

// ── Registration Flow ─────────────────────────────────────────────────────────
router.post(
  '/signup/initiate',
  authRateLimiter,
  validateRequest(AuthValidation.initiateSignup),
  AuthController.initiateSignup,
);
router.post(
  '/signup/resend-otp',
  authRateLimiter,
  validateRequest(AuthValidation.resendOtp),
  AuthController.resendOtp,
);
router.post(
  '/signup/verify-otp',
  authRateLimiter,
  validateRequest(AuthValidation.verifyOtp),
  AuthController.verifyOtp,
);

// ── Login, Token Refresh & Logout Flow ────────────────────────────────────────
router.post('/login', authRateLimiter, validateRequest(AuthValidation.login), AuthController.login);
router.post(
  '/google',
  authRateLimiter,
  validateRequest(AuthValidation.googleLogin),
  AuthController.googleLogin,
);
router.post(
  '/facebook',
  authRateLimiter,
  validateRequest(AuthValidation.facebookLogin),
  AuthController.facebookLogin,
);
router.post(
  '/apple',
  authRateLimiter,
  validateRequest(AuthValidation.appleLogin),
  AuthController.appleLogin,
);
router.post(
  '/refresh-token',
  validateRequest(AuthValidation.refreshToken),
  AuthController.refreshToken,
);

// Bearer token is optional so cookie-only clients can still log out.
router.post('/logout', optionalAuthenticate, AuthController.logout);

export default router;
