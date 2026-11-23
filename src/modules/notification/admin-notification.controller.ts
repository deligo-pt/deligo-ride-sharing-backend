import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { AdminNotificationService } from './admin-notification.service';
import { BroadcastNotificationInput } from './admin-notification.validation';

/** POST /api/v1/admin/notifications/broadcast */
const broadcast = catchAsync(async (req, res) => {
  const result = await AdminNotificationService.broadcastNotification(
    req.body as BroadcastNotificationInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notification broadcast successfully',
    data: result,
  });
});

export const AdminNotificationController = {
  broadcast,
};
