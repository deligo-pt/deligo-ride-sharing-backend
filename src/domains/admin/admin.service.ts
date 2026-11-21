import prisma from '../../config/db';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { ListUsersQuery, ReviewKycInput, UpdateUserStatusInput } from './admin.validation';
import { buildPaginationMeta } from '../../types/api.types';

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

export const getPendingKycProfiles = async () => {
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

export const reviewDriverKyc = async (driverProfileId: string, payload: ReviewKycInput) => {
  // 1. Verify driver profile exists and has a document set
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

  const isApproved = payload.kycStatus === 'APPROVED';

  // 2. Atomic transaction: update document + profile + user in one shot
  const [updatedDoc, updatedProfile] = await prisma.$transaction([
    // Update the DriverDocument verification status to mirror the KYC decision
    prisma.driverDocument.update({
      where: { driverProfileId },
      data: {
        verificationStatus: isApproved ? 'APPROVED' : 'REJECTED',
        reviewNote: payload.reviewNote ?? null,
        rejectionReason: isApproved ? null : (payload.rejectionReason ?? null),
        reviewedAt: new Date(),
      },
    }),

    // Update DriverProfile: set kycStatus and activate the driver if approved
    prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: {
        kycStatus: payload.kycStatus,
        // If approved, leave isAvailable as false — driver can toggle it themselves.
        // If rejected, explicitly lock them out.
        isAvailable: isApproved ? false : false,
      },
      select: driverProfileKycSelect,
    }),

    // Update User.status so the account reflects the review outcome
    prisma.user.update({
      where: { id: profile.user.id },
      data: { status: isApproved ? 'ACTIVE' : 'PENDING_VERIFICATION' },
    }),
  ]);

  return { document: updatedDoc, profile: updatedProfile };
};

// ─── GET /admin/users ─────────────────────────────────────────────────────────
// Returns a paginated list of users, optionally filtered by role.

export const listUsers = async (query: ListUsersQuery) => {
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

export const updateUserStatus = async (userId: string, payload: UpdateUserStatusInput) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.status === payload.status) {
    throw new BadRequestError(`User is already ${payload.status}.`);
  }

  return prisma.user.update({
    where: { id: userId },
    data: { status: payload.status },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
    },
  });
};
