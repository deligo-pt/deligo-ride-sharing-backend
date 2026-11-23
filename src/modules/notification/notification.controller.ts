import { NotificationService } from './notification.service';
import { ListNotificationsQuery, TestSmsDto } from './notification.validation';
import { sendBulkGateSms } from '../../utils/bulkgate';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications Controller  — PRD 3.12
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/notifications — paginated inbox (?page, ?limit, ?unread). */
const listNotifications = catchAsync(async (req, res) => {
  const result = await NotificationService.getInbox(
    req.user!.id,
    req.query as unknown as ListNotificationsQuery,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notifications retrieved successfully',
    data: result,
  });
});

/** PATCH /api/v1/notifications/:id/read — marks one notification read (verifies ownership). */
const readNotification = catchAsync(async (req, res) => {
  const notification = await NotificationService.markAsRead(req.user!.id, String(req.params.id));
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notification marked as read',
    data: { notification },
  });
});

/** PATCH /api/v1/notifications/read-all — marks ALL unread notifications read. */
const readAllNotifications = catchAsync(async (req, res) => {
  const result = await NotificationService.markAllAsRead(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All notifications marked as read',
    data: result,
  });
});

/** POST /api/v1/notifications/test-sms — temporary endpoint to test BulkGate SMS. */
const testSms = catchAsync(async (req, res) => {
  const { phone, message } = req.body as TestSmsDto;

  await sendBulkGateSms(phone, message);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'SMS dispatched successfully',
    data: { message: `SMS request dispatched to ${phone}` },
  });
});

export const NotificationController = {
  listNotifications,
  readNotification,
  readAllNotifications,
  testSms,
};
