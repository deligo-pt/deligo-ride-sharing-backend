import { UserService } from './user.service';
import { SaveFcmTokenDto } from './user.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

/**
 * PATCH /api/v1/users/fcm-token
 * Any authenticated role. Saves/replaces the device's FCM push token.
 */
const saveFcmToken = catchAsync(async (req, res) => {
  const { fcmToken } = req.body as SaveFcmTokenDto;
  const result = await UserService.saveFcmToken(req.user!.id, fcmToken);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'FCM token saved successfully',
    data: result,
  });
});

export const UserController = {
  saveFcmToken,
};
