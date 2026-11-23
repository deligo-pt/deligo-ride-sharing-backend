import prisma from '../../config/db';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../types/api.types';
import { ListRidesQuery, CancelRideInput } from './admin-ride.validation';
import { NotificationService } from '../notification/notification.service';

const listRides = async (query: ListRidesQuery) => {
  const { status, page, limit } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(status && { status }),
  };

  const [rides, total] = await prisma.$transaction([
    prisma.ride.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customerProfile: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
        },
        driverProfile: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
        },
      },
    }),
    prisma.ride.count({ where }),
  ]);

  return { rides, meta: buildPaginationMeta(total, page, limit) };
};

const cancelRideByAdmin = async (rideId: string, payload: CancelRideInput) => {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { customerProfile: true, driverProfile: true },
  });

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Terminal rides cannot be cancelled (completed fares / receipts must not be rewritten)
  if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
    throw new ConflictError(`Ride is already ${ride.status} and cannot be cancelled.`);
  }

  // Update Ride status to CANCELLED, save the reason and release the driver — atomically.
  // The status read above is pinned in the WHERE so a concurrent completion/cancel wins.
  const updatedRide = await prisma.$transaction(async (tx) => {
    const result = await tx.ride.updateMany({
      where: { id: rideId, status: ride.status },
      data: {
        status: 'CANCELLED',
        cancellationReason: `ADMIN_CANCELLED: ${payload.reason}`,
        cancelledAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new ConflictError('The ride was modified by another request. Please refresh and try again.');
    }

    // If a driver was assigned, update their DriverProfile.isAvailable to true
    if (ride.driverProfileId) {
      await tx.driverProfile.update({
        where: { id: ride.driverProfileId },
        data: { isAvailable: true },
      });
    }

    return tx.ride.findUniqueOrThrow({ where: { id: rideId } });
  });

  // NotificationService: alert the driver and customer
  void NotificationService.dispatch({
    userId: ride.customerProfile.userId,
    type: 'RIDE_CANCELLED',
    title: 'Ride Cancelled by Support',
    message: `Your ride was cancelled by an admin. Reason: ${payload.reason}`,
    data: { rideId },
  });

  if (ride.driverProfile) {
    void NotificationService.dispatch({
      userId: ride.driverProfile.userId,
      type: 'RIDE_CANCELLED',
      title: 'Ride Cancelled by Support',
      message: `The current ride was cancelled by an admin. Reason: ${payload.reason}`,
      data: { rideId },
    });
  }

  return updatedRide;
};

export const AdminRideService = {
  listRides,
  cancelRideByAdmin,
};
