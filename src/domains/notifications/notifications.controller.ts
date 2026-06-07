import { NextFunction, Request, Response } from 'express';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import {
  getInbox,
  markAllAsRead,
  markAsRead,
} from './notifications.service';
import { ListNotificationsSchema } from './notifications.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications Controller  — PRD 3.12
// ─────────────────────────────────────────────────────────────────────────────

/** Map domain sentinel errors → HTTP error classes */
function mapError(err: unknown): unknown {
  if (err instanceof Error) {
    if (err.message === 'NOTIFICATION_NOT_FOUND') return new NotFoundError('Notification');
    if (err.message === 'NOTIFICATION_FORBIDDEN') return new ForbiddenError('This notification does not belong to you.');
  }
  return err;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/notifications
 * Returns the paginated inbox for the logged-in user.
 * Query params: page, limit, unread (optional)
 */
export async function listNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = ListNotificationsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError('Invalid query params', parsed.error.flatten().fieldErrors);
    }

    const result = await getInbox(req.user!.id, parsed.data);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(mapError(err));
  }
}

/**
 * PATCH /api/v1/notifications/:id/read
 * Marks a single notification as read. Verifies ownership.
 */
export async function readNotification(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const notificationId = String(req.params.id);
    const notification = await markAsRead(req.user!.id, notificationId);
    res.status(200).json({ success: true, data: { notification } });
  } catch (err) {
    next(mapError(err));
  }
}

/**
 * PATCH /api/v1/notifications/read-all
 * Marks ALL unread notifications as read for the logged-in user.
 */
export async function readAllNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await markAllAsRead(req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
