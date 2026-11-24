import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { ProfileController } from './profile.controller';
import { ProfileValidation } from './profile.validation';

const router: Router = Router();

router.get('/me', authenticate, ProfileController.getMyProfile);

router.patch(
  '/me',
  authenticate,
  validateRequest((req) =>
    req.user?.role === 'DRIVER'
      ? ProfileValidation.updateMyProfile.driver
      : ProfileValidation.updateMyProfile.customer,
  ),
  ProfileController.updateMyProfile,
);

export default router;
