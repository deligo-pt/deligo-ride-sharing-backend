import prisma from '../../config/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { ListUsersQuery, ReviewKycInput, UpdateUserStatusInput } from './admin-user.validation';
import { buildPaginationMeta } from '../../types/api.types';
import { AuthService } from '../auth/auth.service';
import { KycService } from '../kyc/kyc.service';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Service  —  PRD 5.x
// ─────────────────────────────────────────────────────────────────────────────

// ─── Shared document select ───────────────────────────────────────────────────

const driverDocumentSelect = {
  id: true,
  drivingLicenseUrl: true,
  nationalIdUrl: true,
  vehicleRegistrationUrl: true,
  vehicleInsuranceUrl: true,
  driverSelfieUrl: true,
  proofOfAddressUrl: true,
  taxIdUrl: true,
  verificationStatus: true,
  reviewNote: true,
  rejectionReason: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const driverProfileKycSelect = {
  id: true,
  licenseNumber: true,
  kycStatus: true,
  isAvailable: true,
  averageRating: true,
  totalRides: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
    },
  },
  document: { select: driverDocumentSelect },
  vehicle: {
    select: {
      id: true,
      vehicleClass: true,
      vehicleType: true,
      brand: true,
      model: true,
      licensePlate: true,
      approvalStatus: true,
    },
  },
} as const;

// ─── GET /admin/kyc/pending ───────────────────────────────────────────────────
// Returns all DriverProfiles where kycStatus is UNDER_REVIEW or PENDING_DOCS.

const getPendingKycProfiles = async () => {
  return prisma.driverProfile.findMany({
    where: {
      kycStatus: { in: ['UNDER_REVIEW', 'PENDING_DOCS'] },
    },
    select: driverProfileKycSelect,
    orderBy: { createdAt: 'asc' }, // oldest submissions first (FIFO review queue)
  });
};

// ─── PATCH /admin/kyc/:driverProfileId ───────────────────────────────────────
// Admin approves or rejects the full KYC submission for a driver.

const reviewDriverKyc = async (driverProfileId: string, payload: ReviewKycInput) => {
  const profile = await prisma.driverProfile.findUnique({
    where: { id: driverProfileId },
    include: { document: true, user: { select: { id: true } } },
  });

  if (!profile) {
    throw new NotFoundError('DriverProfile');
  }

  if (!profile.document) {
    throw new BadRequestError('This driver has not submitted any KYC documents yet.');
  }

  // Shared with PATCH /kyc/documents/:id/review — document, kycStatus and user.status
  // are updated atomically in KycService.applyKycDecision.
  const { document } = await KycService.applyKycDecision({
    driverProfileId,
    userId: profile.user.id,
    decision: payload.kycStatus,
    reviewNote: payload.reviewNote,
    rejectionReason: payload.rejectionReason,
  });

  const updatedProfile = await prisma.driverProfile.findUniqueOrThrow({
    where: { id: driverProfileId },
    select: driverProfileKycSelect,
  });

  return { document, profile: updatedProfile };
};

// ─── GET /admin/users ─────────────────────────────────────────────────────────
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
        driverProfile: role === 'DRIVER'
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
        customerProfile: role === 'CUSTOMER'
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

// ─── PATCH /admin/users/:userId/status ───────────────────────────────────────
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
      throw new ForbiddenError("Only a SUPER_ADMIN can change another administrator's account status.");
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

  return updated;
};

export const AdminUserService = {
  getPendingKycProfiles,
  reviewDriverKyc,
  listUsers,
  updateUserStatus,
};
