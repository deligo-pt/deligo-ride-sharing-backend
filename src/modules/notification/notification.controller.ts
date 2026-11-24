import { NotificationService } from './notification.service';
import {
  BroadcastNotificationInput,
  ListNotificationsQuery,
  TestSmsDto,
} from './notification.validation';
import { sendBulkGateSms } from '../../utils/bulkgate';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

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

const readNotification = catchAsync(async (req, res) => {
  const notification = await NotificationService.markAsRead(req.user!.id, String(req.params.id));
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notification marked as read',
    data: { notification },
  });
});

const readAllNotifications = catchAsync(async (req, res) => {
  const result = await NotificationService.markAllAsRead(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All notifications marked as read',
    data: result,
  });
});

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

const broadcast = catchAsync(async (req, res) => {
  const result = await NotificationService.broadcastNotification(
    req.body as BroadcastNotificationInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notification broadcast successfully',
    data: result,
  });
});

export const NotificationController = {
  broadcast,
  listNotifications,
  readNotification,
  readAllNotifications,
  testSms,
};
