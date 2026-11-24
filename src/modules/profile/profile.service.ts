import prisma from '../../config/db';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { UpdateCustomerProfileInput, UpdateDriverProfileInput } from './profile.validation';
import type { UserWithProfiles } from './profile.interface';

const getMyProfile = async (userId: string, userRole: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      role: true,
      customerProfile:
        userRole === 'CUSTOMER'
          ? {
              select: {
                totalRides: true,
                averageRating: true,
                homeAddress: true,
                workAddress: true,
                emergencyContactNumber: true,
              },
            }
          : false,
      driverProfile:
        userRole === 'DRIVER'
          ? {
              select: {
                licenseNumber: true,
                totalRides: true,
                averageRating: true,
                isAvailable: true,
                currentLatitude: true,
                currentLongitude: true,
              },
            }
          : false,
    },
  });

  if (!user) {
    throw new NotFoundError('User', { message: 'User not found.', code: 'PROFILE_NOT_FOUND' });
  }

  const { customerProfile, driverProfile, ...userBase } = user as unknown as UserWithProfiles;

  return {
    ...userBase,
    profile: customerProfile ?? driverProfile ?? null,
  };
};

const updateMyProfile = async (
  userId: string,
  userRole: string,
  payload: UpdateCustomerProfileInput | UpdateDriverProfileInput,
) => {
  const { firstName, lastName, phone, ...profileFields } = payload as UpdateCustomerProfileInput &
    UpdateDriverProfileInput;

  const userUpdateData: Record<string, string> = {};
  if (firstName) userUpdateData.firstName = firstName;
  if (lastName) userUpdateData.lastName = lastName;
  if (phone) userUpdateData.phone = phone;

  if (userRole === 'CUSTOMER') {
    const { emergencyContactNumber, homeAddress, workAddress } = profileFields;

    const [updatedUser] = await prisma.$transaction([
      ...(Object.keys(userUpdateData).length > 0
        ? [prisma.user.update({ where: { id: userId }, data: userUpdateData })]
        : []),
      prisma.customerProfile.update({
        where: { userId },
        data: { emergencyContactNumber, homeAddress, workAddress },
      }),
    ]);

    return updatedUser;
  }

  if (userRole === 'DRIVER') {
    const { isAvailable, currentLatitude, currentLongitude } = profileFields;

    const [updatedUser] = await prisma.$transaction([
      ...(Object.keys(userUpdateData).length > 0
        ? [prisma.user.update({ where: { id: userId }, data: userUpdateData })]
        : []),
      prisma.driverProfile.update({
        where: { userId },
        data: { isAvailable, currentLatitude, currentLongitude },
      }),
    ]);

    return updatedUser;
  }

  throw new BadRequestError(
    'Profile update is not supported for this role.',
    undefined,
    'PROFILE_UPDATE_FAILED',
  );
};

export const ProfileService = {
  getMyProfile,
  updateMyProfile,
};
