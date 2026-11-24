import prisma from '../../config/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../types/api.types';
import { AuthService } from '../auth/auth.service';
import { NotificationService, logNotificationFailure } from '../notification/notification.service';
import type { ListUsersQuery, UpdateUserStatusInput } from './user.validation';

const saveFcmToken = async (userId: string, fcmToken: string): Promise<{ message: string }> => {
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { fcmToken, id: { not: userId } },
      data: { fcmToken: null },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { fcmToken },
    }),
  ]);

  console.info(`[FCM] Token saved for userId=${userId}`);
  return { message: 'FCM token saved successfully.' };
};

const listUsers = async (query: ListUsersQuery) => {
  const { role, status, page, limit } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(role && { role }),
    ...(status && { status }),
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        fcmToken: true,
        driverProfile:
          role === 'DRIVER'
            ? {
                select: {
                  id: true,
                  licenseNumber: true,
                  kycStatus: true,
                  isAvailable: true,
                  averageRating: true,
                  totalRides: true,
                  vehicle: {
                    select: {
                      brand: true,
                      model: true,
                      licensePlate: true,
                      vehicleType: true,
                      vehicleClass: true,
                      approvalStatus: true,
                    },
                  },
                },
              }
            : false,
        customerProfile:
          role === 'CUSTOMER'
            ? {
                select: {
                  id: true,
                  totalRides: true,
                  averageRating: true,
                  homeAddress: true,
                },
              }
            : false,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    meta: buildPaginationMeta(total, page, limit),
  };
};

const updateUserStatus = async (
  actor: { id: string },
  userId: string,
  payload: UpdateUserStatusInput,
) => {
  if (actor.id === userId) {
    throw new ForbiddenError('You cannot change your own account status.');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.role === 'ADMIN') {
    const actorProfile = await prisma.adminProfile.findUnique({
      where: { userId: actor.id },
      select: { accessLabel: true },
    });

    if (actorProfile?.accessLabel !== 'SUPER_ADMIN') {
      throw new ForbiddenError(
        "Only a SUPER_ADMIN can change another administrator's account status.",
      );
    }
  }

  if (user.status === payload.status) {
    throw new BadRequestError(`User is already ${payload.status}.`);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status: payload.status },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
    },
  });

  if (payload.status !== 'ACTIVE') {
    await AuthService.revokeAllUserSessions(userId);
  }

  const reason = payload.reason ? ` Reason: ${payload.reason}` : '';
  const notice = {
    ACTIVE: {
      title: 'Account reactivated',
      message: 'Your account has been reactivated. Welcome back!',
    },
    SUSPENDED: { title: 'Account suspended', message: `Your account has been suspended.${reason}` },
    DEACTIVATED: {
      title: 'Account deactivated',
      message: `Your account has been deactivated.${reason}`,
    },
  }[payload.status];

  void NotificationService.dispatch({
    userId,
    type: 'SECURITY',
    ...notice,
    data: { status: payload.status },
  }).catch(logNotificationFailure('user-status'));

  return updated;
};

export const UserService = {
  listUsers,
  updateUserStatus,
  saveFcmToken,
};
