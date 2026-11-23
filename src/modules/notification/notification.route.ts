import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { NotificationController } from './notification.controller';
import { NotificationValidation } from './notification.validation';

// Mounted at: /api/v1/notifications (see src/routes/index.ts)
const router: Router = Router();

// ?page=1&limit=20&unread=true
router.get(
  '/',
  authenticate,
  validateRequest(NotificationValidation.list),
  NotificationController.listNotifications,
);

// MUST stay before /:id/read so "read-all" is not matched as :id
router.patch('/read-all', authenticate, NotificationController.readAllNotifications);

router.patch(
  '/:id/read',
  authenticate,
  validateRequest(NotificationValidation.markAsRead),
  NotificationController.readNotification,
);

// Temporary: dispatches a real SMS through BulkGate (billable) — ADMIN only
router.post(
  '/test-sms',
  authenticate,
  authorize('ADMIN'),
  validateRequest(NotificationValidation.testSms),
  NotificationController.testSms,
);

export default router;
