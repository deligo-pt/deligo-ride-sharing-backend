import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { UserController } from './user.controller';
import { UserValidation } from './user.validation';

const router: Router = Router();

router.patch(
  '/fcm-token',
  authenticate,
  validateRequest(UserValidation.saveFcmToken),
  UserController.saveFcmToken,
);

router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  validateRequest(UserValidation.listUsers),
  UserController.listUsers,
);

router.patch(
  '/:userId/status',
  authenticate,
  authorize('ADMIN'),
  validateRequest(UserValidation.updateUserStatus),
  UserController.updateUserStatus,
);

export default router;
