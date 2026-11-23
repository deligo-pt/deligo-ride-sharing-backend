import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { AuthValidation } from './auth.validation';
import { AdminAuthValidation } from './admin-auth.validation';
import { AdminAuthController } from './admin-auth.controller';

// Mounted at: /api/v1/auth/admin
//
// Admins reuse the shared endpoints for session management:
//   POST /api/v1/auth/refresh-token · /logout
const router: Router = Router();

router.post('/login', validateRequest(AuthValidation.login), AdminAuthController.login);

router.post(
  '/create',
  authenticate,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validateRequest(AdminAuthValidation.create),
  AdminAuthController.createAdmin,
);

router.post(
  '/set-password',
  validateRequest(AdminAuthValidation.setPassword),
  AdminAuthController.setAdminPassword,
);

export default router;
