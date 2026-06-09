import prisma from '../../config/db';
import { NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../types/api.types';
import { ListRidesQuery, CancelRideInput } from './admin.rides.validation';
import { NotificationEngine } from '../notifications/notifications.service';

export const listRides = async (query: ListRidesQuery) => {
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

export const cancelRideByAdmin = async (rideId: string, payload: CancelRideInput) => {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { customerProfile: true, driverProfile: true },
  });

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Update Ride status to CANCELLED and save the reason
  const updatedRide = await prisma.ride.update({
    where: { id: rideId },
    data: {
      status: 'CANCELLED',
      cancellationReason: `ADMIN_CANCELLED: ${payload.reason}`,
      cancelledAt: new Date(),
    },
  });

  // If a driver was assigned, update their DriverProfile.isAvailable to true
  if (ride.driverProfileId) {
    await prisma.driverProfile.update({
      where: { id: ride.driverProfileId },
      data: { isAvailable: true },
    });
  }

  // NotificationEngine: alert the driver and customer
  NotificationEngine.dispatch({
    userId: ride.customerProfile.userId,
    type: 'RIDE_CANCELLED',
    title: 'Ride Cancelled by Support',
    message: `Your ride was cancelled by an admin. Reason: ${payload.reason}`,
    data: { rideId },
  });

  if (ride.driverProfile) {
    NotificationEngine.dispatch({
      userId: ride.driverProfile.userId,
      type: 'RIDE_CANCELLED',
      title: 'Ride Cancelled by Support',
      message: `The current ride was cancelled by an admin. Reason: ${payload.reason}`,
      data: { rideId },
    });
  }

  return updatedRide;
};
