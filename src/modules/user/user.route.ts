import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { saveFcmTokenHandler } from '../notification/notification.controller';

const router: Router = Router();

/** PATCH /api/v1/users/fcm-token — save/replace FCM push token (any role) */
router.patch('/fcm-token', authenticate, saveFcmTokenHandler);

export default router;
