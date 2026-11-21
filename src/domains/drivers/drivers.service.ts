import prisma from '../../config/db';
import type { SingleDocumentPayload, TripHistoryQuery } from './drivers.validation';

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

// ── Step 1: Cloudinary Document Upload Helper ──────────────────────────────────

/**
 * Maps an array of SingleDocumentPayload → the flattened DriverDocument schema.
 * Mirrors the logic in the kyc service for consistency.
 */
function buildFlattenedData(documents: SingleDocumentPayload[]) {
  const map = new Map(documents.map((d) => [d.documentType, d]));

  return {
    drivingLicenseUrl: map.get('DRIVING_LICENSE')?.documentUrl as string,
    nationalIdUrl: map.get('NATIONAL_ID')?.documentUrl as string,
    vehicleRegistrationUrl: map.get('VEHICLE_REGISTRATION')?.documentUrl as string,
    vehicleInsuranceUrl: map.get('VEHICLE_INSURANCE')?.documentUrl as string,
    driverSelfieUrl: map.get('DRIVER_SELFIE')?.documentUrl as string,
    proofOfAddressUrl: map.get('PROOF_OF_ADDRESS')?.documentUrl as string,
    taxIdUrl: map.get('TAX_ID')?.documentUrl as string,
  };
}

/**
 * POST /api/v1/drivers/documents
 *
 * Upsert all 7 KYC documents for a driver. The controller resolves the
 * Cloudinary URLs before calling this function.
 * Sets verificationStatus → PENDING and user.status → PENDING_VERIFICATION.
 */
export async function uploadDriverDocuments(userId: string, documents: SingleDocumentPayload[]) {
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
  });

  console.log(driverProfile);

  console.log('milestone 1');

  if (!driverProfile) {
    throw new Error('DRIVER_PROFILE_NOT_FOUND');
  }

  console.log('milestone 2');

  const flattenedData = buildFlattenedData(documents);

  const upserted = await prisma.driverDocument.upsert({
    where: { driverProfileId: driverProfile.id },
    create: {
      driverProfileId: driverProfile.id,
      verificationStatus: 'PENDING',
      ...flattenedData,
    },
    update: {
      verificationStatus: 'PENDING',
      reviewNote: null,
      rejectionReason: null,
      reviewedAt: null,
      ...flattenedData,
    },
  });

  console.log('milestone 3');

  // Flag the user account for admin review
  await prisma.user.update({
    where: { id: userId },
    data: { status: 'PENDING_VERIFICATION' },
  });

  console.log('milestone 4');

  return upserted;
}

// ── Step 2: Driver Dashboard ───────────────────────────────────────────────────

/**
 * GET /api/v1/drivers/me
 *
 * Returns the full driver dashboard payload:
 *   - DriverProfile (metrics: totalRides, averageRating, isAvailable, etc.)
 *   - Nested Vehicle record
 *   - Nested DriverDocument (KYC status)
 *   - User identity fields (firstName, lastName, email, phone)
 */
export async function getDriverDashboard(userId: string) {
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
    throw new Error('DRIVER_PROFILE_NOT_FOUND');
  }

  return profile;
}

// ── Step 3: Trip History ───────────────────────────────────────────────────────

/**
 * GET /api/v1/drivers/me/history
 *
 * Returns paginated COMPLETED and CANCELLED rides for the logged-in driver.
 * Includes customer details and final fare breakdown.
 */
export async function getDriverTripHistory(userId: string, query: TripHistoryQuery) {
  // 1. Resolve the DriverProfile.id (Ride links on driverProfileId, not userId)
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!driverProfile) {
    throw new Error('DRIVER_PROFILE_NOT_FOUND');
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
