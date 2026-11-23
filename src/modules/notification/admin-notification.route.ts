import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { AdminNotificationController } from './admin-notification.controller';
import { AdminNotificationValidation } from './admin-notification.validation';

// Mounted at: /api/v1/admin/notifications (see src/routes/index.ts) — behind authenticate + authorize('ADMIN').
const router: Router = Router();

router.post(
  '/broadcast',
  validateRequest(AdminNotificationValidation.broadcast),
  AdminNotificationController.broadcast,
);

export default router;
