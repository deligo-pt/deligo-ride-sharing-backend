import { UserService } from './user.service';
import { ListUsersQuery, SaveFcmTokenDto, UpdateUserStatusInput } from './user.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

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

const listUsers = catchAsync(async (req, res) => {
  const { users, meta } = await UserService.listUsers(req.query as unknown as ListUsersQuery);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Users retrieved successfully',
    meta,
    data: { users },
  });
});

const updateUserStatus = catchAsync(async (req, res) => {
  const updated = await UserService.updateUserStatus(
    { id: req.user!.id },
    req.params.userId as string,
    req.body as UpdateUserStatusInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User status updated successfully',
    data: updated,
  });
});

export const UserController = {
  listUsers,
  updateUserStatus,
  saveFcmToken,
};
