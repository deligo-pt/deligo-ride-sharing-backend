import { Router } from 'express';
import { requireAuth } from '../../middlewares/mockAuth';
import * as notificationsController from './notifications.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications Router
// Mounted at: /api/v1/notifications  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/v1/notifications
 * Returns paginated notification inbox for the logged-in user.
 * Query: ?page=1&limit=20&unread=true
 */
router.get('/', requireAuth, notificationsController.listNotifications);

/**
 * PATCH /api/v1/notifications/read-all
 * Mark ALL unread notifications as read.
 * MUST be placed BEFORE /:id/read to avoid Express matching "read-all" as :id
 */
router.patch('/read-all', requireAuth, notificationsController.readAllNotifications);

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read. Verifies ownership.
 */
router.patch('/:id/read', requireAuth, notificationsController.readNotification);

export default router;
