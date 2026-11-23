import prisma from '../../config/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../types/api.types';
import { AuthService } from '../auth/auth.service';
import { NotificationService, logNotificationFailure } from '../notification/notification.service';
import type { ListUsersQuery, UpdateUserStatusInput } from './user.validation';

// ─────────────────────────────────────────────────────────────────────────────
// User Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save (or replace) the FCM push token for a user.
 * Called by the mobile app on login or when the OS issues a new token.
 */
async function saveFcmToken(userId: string, fcmToken: string): Promise<{ message: string }> {
  // A device token belongs to ONE account. Clear it from every other user first, so two accounts that
  // sign in on the same phone never receive each other's push notifications.
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
}

// ─── GET /users ─────────────────────────────────────────────────────────
// Returns a paginated list of users, optionally filtered by role.

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
        // Include driver profile when filtering by DRIVER role (or always, null for non-drivers)
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

// ─── PATCH /users/:userId/status ───────────────────────────────────────
// Admin manually suspends, re-activates, or deactivates any user account.

const updateUserStatus = async (
  actor: { id: string },
  userId: string,
  payload: UpdateUserStatusInput,
) => {
  // Guard 1: an admin can never change their own account status (no self-lockout / self-reactivation).
  if (actor.id === userId) {
    throw new ForbiddenError('You cannot change your own account status.');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError('User');
  }

  // Guard 2: only a SUPER_ADMIN may change another administrator's status.
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

  // Suspension / deactivation: kill refresh sessions and live sockets immediately.
  if (payload.status !== 'ACTIVE') {
    await AuthService.revokeAllUserSessions(userId);
  }

  // Tell the user (in-app + push; their sockets are already closed on suspension).
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
