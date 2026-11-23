import { ProfileService } from './profile.service';
import { UpdateCustomerProfileInput, UpdateDriverProfileInput } from './profile.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

/** GET /api/v1/profile/me — own profile (role-aware). */
const getMyProfile = catchAsync(async (req, res) => {
  const { id, role } = req.user!;
  const profile = await ProfileService.getMyProfile(id, role);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Profile retrieved successfully',
    data: profile,
  });
});

/** PATCH /api/v1/profile/me — update own profile (role-aware). */
const updateMyProfile = catchAsync(async (req, res) => {
  const { id, role } = req.user!;

  await ProfileService.updateMyProfile(
    id,
    role,
    req.body as UpdateCustomerProfileInput | UpdateDriverProfileInput,
  );

  // Re-fetch so the response carries fresh data
  const updatedProfile = await ProfileService.getMyProfile(id, role);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Profile updated successfully',
    data: updatedProfile,
  });
});

export const ProfileController = {
  getMyProfile,
  updateMyProfile,
};
