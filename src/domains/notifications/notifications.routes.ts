import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as notificationsController from './notifications.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications Router
// Mounted at: /api/v1/notifications  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router: Router = Router();

/**
 * GET /api/v1/notifications
 * Returns paginated notification inbox for the logged-in user.
 * Query: ?page=1&limit=20&unread=true
 */
router.get('/', authenticate, notificationsController.listNotifications);

/**
 * PATCH /api/v1/notifications/read-all
 * Mark ALL unread notifications as read.
 * MUST be placed BEFORE /:id/read to avoid Express matching "read-all" as :id
 */
router.patch('/read-all', authenticate, notificationsController.readAllNotifications);

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read. Verifies ownership.
 */
router.patch('/:id/read', authenticate, notificationsController.readNotification);

/**
 * POST /api/v1/notifications/test-sms
 * Test endpoint to dispatch an SMS
 */
router.post('/test-sms', notificationsController.testSmsHandler);

export default router;
