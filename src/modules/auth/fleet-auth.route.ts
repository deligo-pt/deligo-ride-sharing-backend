import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { AuthValidation } from './auth.validation';
import { FleetAuthController } from './fleet-auth.controller';

// Mounted at: /api/v1/auth/fleet (and /fleet-manager)
//
// Fleet managers reuse the shared endpoints for OTP verification and session management:
//   POST /api/v1/auth/signup/resend-otp · /signup/verify-otp · /refresh-token · /logout
const router: Router = Router();

router.post(
  '/signup/initiate',
  validateRequest(AuthValidation.initiateSignup),
  FleetAuthController.initiateSignup,
);

router.post('/login', validateRequest(AuthValidation.login), FleetAuthController.login);

export default router;
