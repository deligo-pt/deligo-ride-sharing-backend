import { Router } from 'express';
import { authenticate, optionalAuthenticate, requireRole } from '../../middlewares/auth';
import { authRateLimiter } from '../../middlewares/rateLimiter';
import { validateRequest } from '../../middlewares/validateRequest';
import { AuthController } from './auth.controller';
import { AuthValidation } from './auth.validation';

// Mounted at: /api/v1/auth (see src/routes/index.ts)
// Credential endpoints are rate limited per route; session endpoints (/refresh-token, /logout)
// are shared by every role.
const router: Router = Router();

// ── Registration (customer) ───────────────────────────────────────────────────
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

// ── Login, token refresh & logout (customer + social + shared session endpoints) ──
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

// ── Driver ────────────────────────────────────────────────────────────────────
router.post(
  '/driver/signup/initiate',
  authRateLimiter,
  validateRequest(AuthValidation.initiateSignup),
  AuthController.driverInitiateSignup,
);
router.post(
  '/driver/login',
  authRateLimiter,
  validateRequest(AuthValidation.login),
  AuthController.driverLogin,
);

// ── Fleet manager (/fleet and the /fleet-manager alias) ───────────────────────
for (const prefix of ['/fleet', '/fleet-manager']) {
  router.post(
    `${prefix}/signup/initiate`,
    authRateLimiter,
    validateRequest(AuthValidation.initiateSignup),
    AuthController.fleetInitiateSignup,
  );
  router.post(
    `${prefix}/login`,
    authRateLimiter,
    validateRequest(AuthValidation.login),
    AuthController.fleetLogin,
  );
}

// ── Admin ─────────────────────────────────────────────────────────────────────
router.post(
  '/admin/login',
  authRateLimiter,
  validateRequest(AuthValidation.login),
  AuthController.adminLogin,
);

// ADMIN / SUPER_ADMIN invites a new administrator
router.post(
  '/admin/create',
  authRateLimiter,
  authenticate,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validateRequest(AuthValidation.createAdmin),
  AuthController.createAdmin,
);

// Public: set the password from the one-time invitation link
router.post(
  '/admin/set-password',
  authRateLimiter,
  validateRequest(AuthValidation.setAdminPassword),
  AuthController.setAdminPassword,
);

export default router;
