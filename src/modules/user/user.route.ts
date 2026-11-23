import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
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

/** GET /api/v1/users — ADMIN: paginated user list (?role=DRIVER&status=ACTIVE&page=1&limit=20) */
router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  validateRequest(UserValidation.listUsers),
  UserController.listUsers,
);

/** PATCH /api/v1/users/:userId/status — ADMIN: suspend / reactivate / deactivate an account */
router.patch(
  '/:userId/status',
  authenticate,
  authorize('ADMIN'),
  validateRequest(UserValidation.updateUserStatus),
  UserController.updateUserStatus,
);

export default router;
