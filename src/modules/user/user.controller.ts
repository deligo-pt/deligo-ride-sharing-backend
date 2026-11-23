import { UserService } from './user.service';
import { ListUsersQuery, SaveFcmTokenDto, UpdateUserStatusInput } from './user.validation';
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

/** GET /api/v1/users — Role: ADMIN. Paginated user list (?role, ?status). */
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

/**
 * PATCH /api/v1/users/:userId/status — Role: ADMIN.
 * An admin can never change their own status; only a SUPER_ADMIN can change another ADMIN.
 */
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
