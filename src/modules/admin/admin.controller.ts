import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { AdminService } from './admin.service';
import { ListUsersQuery, ReviewKycInput, UpdateUserStatusInput } from './admin.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Controller  —  PRD 5.x
// The admin router applies authenticate + authorize('ADMIN') to every route.
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/admin/kyc/pending */
const getPendingKyc = catchAsync(async (_req, res) => {
  const profiles = await AdminService.getPendingKycProfiles();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pending KYC profiles retrieved successfully',
    data: { count: profiles.length, profiles },
  });
});

/** PATCH /api/v1/admin/kyc/:driverProfileId */
const reviewKyc = catchAsync(async (req, res) => {
  const result = await AdminService.reviewDriverKyc(
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
  const { users, meta } = await AdminService.listUsers(req.query as unknown as ListUsersQuery);
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
  const updated = await AdminService.updateUserStatus(
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

export const AdminController = {
  getPendingKyc,
  reviewKyc,
  listUsers,
  updateUserStatus,
};
