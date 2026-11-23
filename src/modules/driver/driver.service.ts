import prisma from '../../config/db';
import type { TripHistoryQuery } from './driver.validation';
import { NotFoundError } from '../../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Drivers Service  —  PRD 2.2: Driver Dashboard
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared Selects ─────────────────────────────────────────────────────────────

const documentSelect = {
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

// ── Driver Dashboard ───────────────────────────────────────────────────

/**
 * GET /api/v1/drivers/me
 *
 * Returns the full driver dashboard payload:
 *   - DriverProfile (metrics: totalRides, averageRating, isAvailable, etc.)
 *   - Nested Vehicle record
 *   - Nested DriverDocument (KYC status)
 *   - User identity fields (firstName, lastName, email, phone)
 */
async function getDriverDashboard(userId: string) {
  const profile = await prisma.driverProfile.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          status: true,
          fcmToken: true,
        },
      },
      vehicle: true,
      document: {
        select: documentSelect,
      },
    },
  });

  if (!profile) {
    throw new NotFoundError('Driver profile');
  }

  return profile;
}

// ── Trip History ───────────────────────────────────────────────────────

/**
 * GET /api/v1/drivers/me/history
 *
 * Returns paginated COMPLETED and CANCELLED rides for the logged-in driver.
 * Includes customer details and final fare breakdown.
 */
async function getDriverTripHistory(userId: string, query: TripHistoryQuery) {
  // 1. Resolve the DriverProfile.id (Ride links on driverProfileId, not userId)
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!driverProfile) {
    throw new NotFoundError('Driver profile');
  }

  const { page, limit } = query;
  const skip = (page - 1) * limit;

  // 2. Fetch total count for pagination metadata
  const total = await prisma.ride.count({
    where: {
      driverProfileId: driverProfile.id,
      status: { in: ['COMPLETED', 'CANCELLED'] },
    },
  });

  // 3. Fetch paginated rides
  const rides = await prisma.ride.findMany({
    where: {
      driverProfileId: driverProfile.id,
      status: { in: ['COMPLETED', 'CANCELLED'] },
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
    include: {
      customerProfile: {
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
    // Return key fare + trip fields
  });

  // 4. Shape the response — expose what the frontend actually needs
  const items = rides.map((ride) => ({
    id: ride.id,
    status: ride.status,
    pickupAddress: ride.pickupAddress,
    dropoffAddress: ride.dropoffAddress,
    distanceKm: ride.distanceKm,
    durationMinutes: ride.durationMinutes,
    estimatedFare: ride.estimatedFare,
    finalFare: ride.finalFare,
    vehicleType: ride.vehicleType,
    vehicleClass: ride.vehicleClass,
    cancellationReason: ride.cancellationReason,
    requestedAt: ride.requestedAt,
    completedAt: ride.completedAt,
    cancelledAt: ride.cancelledAt,
    customer: {
      firstName: ride.customerProfile.user.firstName,
      lastName: ride.customerProfile.user.lastName,
      averageRating: ride.customerProfile.averageRating,
    },
  }));

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
}

export const DriverService = {
  getDriverDashboard,
  getDriverTripHistory,
};
