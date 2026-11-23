import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { AdminUserService } from './admin-user.service';
import { ListUsersQuery, ReviewKycInput, UpdateUserStatusInput } from './admin-user.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Controller  —  PRD 5.x
// The admin router applies authenticate + authorize('ADMIN') to every route.
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/admin/kyc/pending */
const getPendingKyc = catchAsync(async (_req, res) => {
  const profiles = await AdminUserService.getPendingKycProfiles();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pending KYC profiles retrieved successfully',
    data: { count: profiles.length, profiles },
  });
});

/** PATCH /api/v1/admin/kyc/:driverProfileId */
const reviewKyc = catchAsync(async (req, res) => {
  const result = await AdminUserService.reviewDriverKyc(
    req.params.driverProfileId as string,
    req.body as ReviewKycInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Driver KYC reviewed successfully',
    data: result,
  });
});

/** GET /api/v1/admin/users */
const listUsers = catchAsync(async (req, res) => {
  const { users, meta } = await AdminUserService.listUsers(req.query as unknown as ListUsersQuery);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Users retrieved successfully',
    meta,
    data: { users },
  });
});

/** PATCH /api/v1/admin/users/:userId/status */
const updateUserStatus = catchAsync(async (req, res) => {
  const updated = await AdminUserService.updateUserStatus(
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

export const AdminUserController = {
  getPendingKyc,
  reviewKyc,
  listUsers,
  updateUserStatus,
};
