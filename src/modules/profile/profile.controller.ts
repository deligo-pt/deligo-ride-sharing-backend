import { ProfileService } from './profile.service';
import { UpdateCustomerProfileInput, UpdateDriverProfileInput } from './profile.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

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

const updateMyProfile = catchAsync(async (req, res) => {
  const { id, role } = req.user!;

  await ProfileService.updateMyProfile(
    id,
    role,
    req.body as UpdateCustomerProfileInput | UpdateDriverProfileInput,
  );

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
