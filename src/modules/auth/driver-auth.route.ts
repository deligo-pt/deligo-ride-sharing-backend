import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { AuthValidation } from './auth.validation';
import { DriverAuthController } from './driver-auth.controller';

// Mounted at: /api/v1/auth/driver
//
// Drivers reuse the shared endpoints for OTP verification and session management:
//   POST /api/v1/auth/signup/resend-otp · /signup/verify-otp · /refresh-token · /logout
const router: Router = Router();

router.post(
  '/signup/initiate',
  validateRequest(AuthValidation.initiateSignup),
  DriverAuthController.initiateSignup,
);

router.post('/login', validateRequest(AuthValidation.login), DriverAuthController.login);

export default router;
