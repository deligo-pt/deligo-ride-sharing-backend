import { Router } from 'express';
import { authenticate, optionalAuthenticate, requireRole } from '../../middlewares/auth';
import { authRateLimiter } from '../../middlewares/rateLimiter';
import { validateRequest } from '../../middlewares/validateRequest';
import { AuthController } from './auth.controller';
import { AuthValidation } from './auth.validation';

const router: Router = Router();

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
router.post(
  '/logout',
  optionalAuthenticate,
  validateRequest(AuthValidation.logout),
  AuthController.logout,
);

router.post(
  '/driver/signup/initiate',
  authRateLimiter,
  validateRequest(AuthValidation.emailOnlySignup),
  AuthController.driverInitiateSignup,
);
router.post(
  '/driver/login',
  authRateLimiter,
  validateRequest(AuthValidation.login),
  AuthController.driverLogin,
);

for (const prefix of ['/fleet', '/fleet-manager']) {
  router.post(
    `${prefix}/signup/initiate`,
    authRateLimiter,
    validateRequest(AuthValidation.emailOnlySignup),
    AuthController.fleetInitiateSignup,
  );
  router.post(
    `${prefix}/login`,
    authRateLimiter,
    validateRequest(AuthValidation.login),
    AuthController.fleetLogin,
  );
}

router.post(
  '/admin/login',
  authRateLimiter,
  validateRequest(AuthValidation.login),
  AuthController.adminLogin,
);
router.post(
  '/admin/create',
  authRateLimiter,
  authenticate,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validateRequest(AuthValidation.createAdmin),
  AuthController.createAdmin,
);
router.post(
  '/admin/set-password',
  authRateLimiter,
  validateRequest(AuthValidation.setAdminPassword),
  AuthController.setAdminPassword,
);

export const authRouter = router;
