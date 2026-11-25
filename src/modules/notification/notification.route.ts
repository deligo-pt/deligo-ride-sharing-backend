import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { NotificationController } from './notification.controller';
import { NotificationValidation } from './notification.validation';

const router: Router = Router();

router.get(
  '/',
  authenticate,
  validateRequest(NotificationValidation.list),
  NotificationController.listNotifications,
);

router.post(
  '/broadcast',
  authenticate,
  authorize('ADMIN'),
  validateRequest(NotificationValidation.broadcast),
  NotificationController.broadcast,
);

router.patch('/read-all', authenticate, NotificationController.readAllNotifications);

router.patch(
  '/:id/read',
  authenticate,
  validateRequest(NotificationValidation.markAsRead),
  NotificationController.readNotification,
);

router.post(
  '/test-sms',
  authenticate,
  authorize('ADMIN'),
  validateRequest(NotificationValidation.testSms),
  NotificationController.testSms,
);

export const notificationRouter = router;
