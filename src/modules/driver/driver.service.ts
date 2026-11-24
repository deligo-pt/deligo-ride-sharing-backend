import prisma from '../../config/db';
import type { TripHistoryQuery } from './driver.validation';
import { NotFoundError } from '../../utils/errors';

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

const getDriverDashboard = async (userId: string) => {
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
};

const getDriverTripHistory = async (userId: string, query: TripHistoryQuery) => {
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!driverProfile) {
    throw new NotFoundError('Driver profile');
  }

  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const total = await prisma.ride.count({
    where: {
      driverProfileId: driverProfile.id,
      status: { in: ['COMPLETED', 'CANCELLED'] },
    },
  });

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
  });

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
};

export const DriverService = {
  getDriverDashboard,
  getDriverTripHistory,
};
