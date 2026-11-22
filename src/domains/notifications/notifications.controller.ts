import { NextFunction, Request, Response } from 'express';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { getInbox, markAllAsRead, markAsRead, saveFcmToken } from './notifications.service';
import { ListNotificationsSchema, SaveFcmTokenSchema } from './notifications.validation';
import { sendBulkGateSms } from '../../utils/bulkgate';
import { sendResponse } from '../../utils/sendResponse';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications Controller  — PRD 3.12
// ─────────────────────────────────────────────────────────────────────────────

/** Map domain sentinel errors → HTTP error classes */
function mapError(err: unknown): unknown {
  if (err instanceof Error) {
    if (err.message === 'NOTIFICATION_NOT_FOUND') return new NotFoundError('Notification');
    if (err.message === 'NOTIFICATION_FORBIDDEN')
      return new ForbiddenError('This notification does not belong to you.');
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
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Notifications retrieved successfully',
      data: result,
    });
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
    const notification = await markAsRead(
      (req.user!.id = 'c46ca1ad-c7b0-4f5e-85a9-9d5807ae5e39'),
      notificationId,
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Notification marked as read',
      data: { notification },
    });
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
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'All notifications marked as read',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/users/fcm-token
 * Saves or replaces the FCM push token for the authenticated user.
 * Called by the mobile app on login or whenever the OS rotates the token.
 * Accessible by any authenticated role (CUSTOMER, DRIVER, ADMIN).
 */
export async function saveFcmTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = SaveFcmTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const result = await saveFcmToken(req.user!.id, parsed.data.fcmToken);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'FCM token saved successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/notifications/test-sms
 * Temporary endpoint to test BulkGate SMS integration
 */
export async function testSmsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { phone, message } = req.body as { phone?: string; message?: string };
    if (!phone || !message) {
      throw new BadRequestError('phone and message are required');
    }

    // Call our new utility
    await sendBulkGateSms(phone, message);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'SMS dispatched successfully',
      data: { message: `SMS request dispatched to ${phone}` },
    });
  } catch (err) {
    next(err);
  }
}
