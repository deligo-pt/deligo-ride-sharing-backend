import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { UserController } from './user.controller';
import { UserValidation } from './user.validation';

// Mounted at: /api/v1/users (see src/routes/index.ts)
const router: Router = Router();

/** PATCH /api/v1/users/fcm-token — save/replace FCM push token (any role) */
router.patch(
  '/fcm-token',
  authenticate,
  validateRequest(UserValidation.saveFcmToken),
  UserController.saveFcmToken,
);

export default router;
