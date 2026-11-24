import { Prisma, RideStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import prisma from '../../config/db';
import { LocationService, redis } from '../../utils/redis';
import { PricingService } from './pricing.service';
import { getMultiStopRouteData } from '../../utils/map.service';
import { addScheduledRideJob } from '../../queues/ride.queue';
import type {
  UpdateLocationDto,
  SearchRideDto,
  EstimateFareDto,
  RequestRideDto,
  UpdateRideStatusDto,
  CancelRideDto,
  ListRidesQuery,
  AdminCancelRideInput,
} from './ride.validation';
import { ReceiptService } from './receipt.service';
import { NotificationService, logNotificationFailure } from '../notification/notification.service';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../types/api.types';
import type { RequestRideResult, RideChange, RideViewer } from './ride.interface';
import {
  NEARBY_DRIVER_RADIUS_KM,
  RIDE_STATUS_NOTICES,
  RIDE_TRANSITIONS,
  STATUS_TIMESTAMP_MAP,
  TRACKING_BASE_URL,
  TRACKING_TOKEN_TTL_SECONDS,
} from './ride.constant';

const announceRideChange = async (change: RideChange): Promise<void> => {
  NotificationService.emitRideStatus({
    rideId: change.rideId,
    status: change.status,
    updatedBy: change.updatedBy,
    reason: change.reason ?? null,
  });

  const ride = await prisma.ride.findUnique({
    where: { id: change.rideId },
    select: {
      customerProfile: { select: { userId: true } },
      driverProfile: { select: { userId: true } },
    },
  });
  const recipientId =
    change.notify === 'CUSTOMER' ? ride?.customerProfile.userId : ride?.driverProfile?.userId;
  if (!recipientId) return;

  await NotificationService.dispatch(
    {
      userId: recipientId,
      type: change.type,
      title: change.title,
      message: change.message,
      data: { rideId: change.rideId, status: change.status, ...change.data },
    },
    ['IN_APP', 'WEBSOCKET', 'PUSH'],
  );
};

const notifyRideStatus = (rideId: string, status: RideStatus): void => {
  const notice = RIDE_STATUS_NOTICES[status];
  if (!notice) return;
  void announceRideChange({
    rideId,
    status,
    updatedBy: 'DRIVER',
    notify: 'CUSTOMER',
    type: 'RIDE_UPDATE',
    ...notice,
  }).catch(logNotificationFailure(`ride-${status.toLowerCase()}`));
};

const updateDriverLocation = async (driverId: string, dto: UpdateLocationDto): Promise<void> => {
  await LocationService.updateDriverLocation(driverId, dto.lng, dto.lat);

  await prisma.driverProfile.update({
    where: { userId: driverId },
    data: {
      currentLatitude: dto.lat,
      currentLongitude: dto.lng,
    },
  });
};

const findNearbyDrivers = async (dto: SearchRideDto) => {
  const candidateIds = await LocationService.findNearbyDrivers(
    dto.pickupLng,
    dto.pickupLat,
    NEARBY_DRIVER_RADIUS_KM,
  );

  if (candidateIds.length === 0) {
    return [];
  }

  return prisma.driverProfile.findMany({
    where: {
      userId: { in: candidateIds },
      isAvailable: true,
      document: { verificationStatus: 'APPROVED' },
      vehicle: { approvalStatus: 'APPROVED' },
    },
    include: {
      vehicle: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });
};

const estimateFare = async (userId: string, dto: EstimateFareDto) => {
  const estimates = await PricingService.calculateEstimate(
    dto.pickupLat,
    dto.pickupLng,
    dto.dropoffLat,
    dto.dropoffLng,
    dto.vehicleType,
    dto.promoCode,
    1.0,
    dto.stops,
  );

  await redis.set(`fare_estimate:${userId}`, JSON.stringify(estimates), 'EX', 300);

  return estimates;
};

const requestRide = async (userId: string, dto: RequestRideDto): Promise<RequestRideResult> => {
  const customerProfile = await prisma.customerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!customerProfile) {
    throw new NotFoundError('CustomerProfile for this user. Create a customer profile first.');
  }

  const activeRide = await prisma.ride.findFirst({
    where: {
      customerId: customerProfile.id,
      status: { in: ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS', 'DRIVER_ARRIVED'] },
    },
  });

  if (activeRide) {
    throw new ConflictError('You already have an active ride.');
  }

  const estimateKey = `fare_estimate:${userId}`;

  const estimateCache = await redis.get(estimateKey);

  const cachedEstimates = JSON.parse(estimateCache ?? 'null') as { subtotal?: number }[] | null;
  if (dto.estimatedFare !== cachedEstimates?.[0]?.subtotal) {
    throw new BadRequestError(
      'Estimated fare does not match the latest estimate. Please request a new fare estimate.',
      undefined,
      'ESTIMATED_FARE_MISMATCH',
    );
  }

  const intermediateStops = dto.stops ?? [];
  const coordinates = [
    { lat: dto.pickupLat, lng: dto.pickupLng },
    ...intermediateStops.map((s) => ({ lat: s.lat, lng: s.lng })),
    { lat: dto.dropoffLat, lng: dto.dropoffLng },
  ];

  const routeData = await getMultiStopRouteData(coordinates);
  const estimatedDistance = Math.round((routeData.distanceMeters / 1_000) * 100) / 100;
  const estimatedDuration = Math.ceil(routeData.durationSeconds / 60);

  const isScheduled = dto.scheduledAt !== undefined;

  const ride = await prisma.ride.create({
    data: {
      customerId: customerProfile.id,
      pickupAddress: dto.pickupAddress,
      pickupLatitude: dto.pickupLat,
      pickupLongitude: dto.pickupLng,
      dropoffAddress: dto.dropoffAddress,
      dropoffLatitude: dto.dropoffLat,
      dropoffLongitude: dto.dropoffLng,
      vehicleType: dto.vehicleType,
      estimatedFare: dto.estimatedFare,
      estimatedDistance,
      estimatedDuration,
      status: isScheduled ? 'SCHEDULED' : 'REQUESTED',
      scheduledAt: dto.scheduledAt ?? null,
      ...(intermediateStops.length > 0 && {
        stops: {
          create: intermediateStops.map((elm, idx) => ({
            address: elm.address,
            lat: elm.lat,
            lng: elm.lng,
            sequence: idx + 1,
            status: 'PENDING' as const,
          })),
        },
      }),
    },
    include: {
      customerProfile: { select: { userId: true } },
      stops: true,
    },
  });

  if (dto.scheduledAt) {
    await addScheduledRideJob(ride.id, dto.scheduledAt);
    return { ride, dispatchedDriverIds: [], scheduled: true };
  }

  const candidateUserIds = await LocationService.findNearbyDrivers(
    dto.pickupLng,
    dto.pickupLat,
    NEARBY_DRIVER_RADIUS_KM,
  );

  let dispatchedDriverIds: string[] = [];

  if (candidateUserIds.length > 0) {
    const eligibleDrivers = await prisma.driverProfile.findMany({
      where: {
        userId: { in: candidateUserIds },
        isAvailable: true,
        vehicle: {
          vehicleType: dto.vehicleType,
          approvalStatus: 'APPROVED',
        },
      },
      select: { userId: true },
    });

    dispatchedDriverIds = eligibleDrivers.map((d) => d.userId);
  }

  if (dispatchedDriverIds.length > 0) {
    void NotificationService.sendToUsers(dispatchedDriverIds, {
      type: 'RIDE_REQUEST',
      title: 'New ride request',
      message: `Pickup: ${ride.pickupAddress}`,
      data: { rideId: ride.id, vehicleType: dto.vehicleType, pickupAddress: ride.pickupAddress },
    }).catch(logNotificationFailure('ride-request'));
  }

  return { ride, dispatchedDriverIds, scheduled: false };
};

const canTransitionRide = (from: RideStatus, to: RideStatus): boolean => {
  return RIDE_TRANSITIONS[from].includes(to);
};

const assertRideTransition = (from: RideStatus, to: RideStatus): void => {
  if (!canTransitionRide(from, to)) {
    throw new BadRequestError(`Invalid ride status transition: ${from} → ${to}.`);
  }
};

const rideStateConflict = () =>
  new ConflictError('The ride was modified by another request. Please refresh and try again.');

const acceptRide = async (driverUserId: string, rideId: string) => {
  const acceptedRide = await prisma.$transaction(async (tx) => {
    const driverProfile = await tx.driverProfile.findUnique({
      where: { userId: driverUserId },
      select: {
        id: true,
        kycStatus: true,
        isDeleted: true,
        user: { select: { status: true } },
      },
    });

    if (!driverProfile) {
      throw new NotFoundError('DriverProfile for this user. Complete driver onboarding first.');
    }

    if (
      driverProfile.isDeleted ||
      driverProfile.kycStatus !== 'APPROVED' ||
      driverProfile.user.status !== 'ACTIVE'
    ) {
      throw new ForbiddenError(
        'Your driver account is not approved to accept rides. Complete KYC verification or contact support.',
      );
    }

    const driverLock = await tx.driverProfile.updateMany({
      where: {
        id: driverProfile.id,
        isAvailable: true,
        isDeleted: false,
        kycStatus: 'APPROVED',
        user: { status: 'ACTIVE' },
      },
      data: { isAvailable: false },
    });

    if (driverLock.count === 0) {
      throw new BadRequestError('You are not available to accept rides.');
    }

    const claim = await tx.ride.updateMany({
      where: { id: rideId, status: 'REQUESTED', driverProfileId: null, isDeleted: false },
      data: {
        status: 'ACCEPTED',
        driverProfileId: driverProfile.id,
        acceptedAt: new Date(),
      },
    });

    if (claim.count === 0) {
      const exists = await tx.ride.findUnique({ where: { id: rideId }, select: { id: true } });
      throw exists
        ? new BadRequestError('Ride is no longer available for acceptance.')
        : new NotFoundError('Ride');
    }

    return tx.ride.findUniqueOrThrow({ where: { id: rideId } });
  });

  void announceRideChange({
    rideId,
    status: 'ACCEPTED',
    updatedBy: 'DRIVER',
    notify: 'CUSTOMER',
    type: 'RIDE_ACCEPTED',
    title: 'Driver found',
    message: 'A driver accepted your ride and is on the way to the pickup location.',
  }).catch(logNotificationFailure('ride-accepted'));

  return acceptedRide;
};

const updateRideStatus = async (driverUserId: string, rideId: string, dto: UpdateRideStatusDto) => {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { customerProfile: { select: { id: true } } },
  });

  if (!ride || ride.isDeleted) {
    throw new NotFoundError('Ride');
  }

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: driverUserId },
    select: { id: true },
  });

  if (!driverProfile || ride.driverProfileId !== driverProfile.id) {
    throw new ForbiddenError('You are not the assigned driver for this ride.');
  }

  assertRideTransition(ride.status, dto.status);

  const timestampField = STATUS_TIMESTAMP_MAP[dto.status];

  const rideUpdateData: Prisma.RideUpdateManyMutationInput = {
    status: dto.status,
    [timestampField]: new Date(),
    ...(dto.finalDistanceKm !== undefined && { distanceKm: dto.finalDistanceKm }),
    ...(dto.finalDurationMinutes !== undefined && { durationMinutes: dto.finalDurationMinutes }),
  };

  const guard = { id: rideId, status: ride.status, driverProfileId: driverProfile.id };

  if (dto.status !== 'COMPLETED') {
    const updatedRide = await prisma.$transaction(async (tx) => {
      const result = await tx.ride.updateMany({ where: guard, data: rideUpdateData });
      if (result.count === 0) throw rideStateConflict();
      return tx.ride.findUniqueOrThrow({ where: { id: rideId } });
    });
    notifyRideStatus(rideId, dto.status);
    return { ride: updatedRide, fareBreakdown: null };
  }

  const actualDistKm = dto.actualDistanceKm ?? dto.finalDistanceKm ?? 1;
  const actualDurMin = dto.actualDurationMinutes ?? dto.finalDurationMinutes ?? 10;

  const fareBreakdown = await PricingService.calculateFinalFare(
    ride.vehicleType,
    actualDistKm,
    actualDurMin,
    {
      tolls: dto.tolls,
      waitingTimeMinutes: dto.waitingTimeMinutes,
    },
  );

  rideUpdateData.finalFare = fareBreakdown.grandTotal;
  rideUpdateData.distanceKm = fareBreakdown.distanceKm;
  rideUpdateData.durationMinutes = fareBreakdown.estimatedDurationMinutes;

  const updatedRide = await prisma.$transaction(async (tx) => {
    const result = await tx.ride.updateMany({ where: guard, data: rideUpdateData });
    if (result.count === 0) throw rideStateConflict();

    await tx.driverProfile.update({
      where: { id: driverProfile.id },
      data: { isAvailable: true, totalRides: { increment: 1 } },
    });
    await tx.customerProfile.update({
      where: { id: ride.customerProfile.id },
      data: { totalRides: { increment: 1 } },
    });

    return tx.ride.findUniqueOrThrow({ where: { id: rideId } });
  });

  void ReceiptService.generateAndSendReceipt(rideId);
  notifyRideStatus(rideId, 'COMPLETED');

  return { ride: updatedRide, fareBreakdown };
};

const assertRideParticipant = (
  ride: { customerProfile: { userId: string }; driverProfile: { userId: string } | null },
  userId: string,
): void => {
  const isCustomer = ride.customerProfile.userId === userId;
  const isAssignedDriver = ride.driverProfile?.userId === userId;

  if (!isCustomer && !isAssignedDriver) {
    throw new ForbiddenError('You are not a participant in this ride.');
  }
};

const cancelRide = async (userId: string, rideId: string, dto: CancelRideDto) => {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      status: true,
      driverProfileId: true,
      isDeleted: true,
      customerProfile: { select: { userId: true } },
      driverProfile: { select: { userId: true } },
    },
  });

  if (!ride || ride.isDeleted) {
    throw new NotFoundError('Ride');
  }

  assertRideParticipant(ride, userId);

  if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
    throw new BadRequestError('Ride is already completed or cancelled.');
  }

  assertRideTransition(ride.status, 'CANCELLED');

  const cancelledRide = await prisma.$transaction(async (tx) => {
    const result = await tx.ride.updateMany({
      where: { id: rideId, status: ride.status, driverProfileId: ride.driverProfileId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      },
    });

    if (result.count === 0) throw rideStateConflict();

    if (ride.driverProfileId) {
      await tx.driverProfile.update({
        where: { id: ride.driverProfileId },
        data: { isAvailable: true },
      });
    }

    return tx.ride.findUniqueOrThrow({ where: { id: rideId } });
  });

  const cancelledByCustomer = ride.customerProfile.userId === userId;
  void announceRideChange({
    rideId,
    status: 'CANCELLED',
    updatedBy: cancelledByCustomer ? 'CUSTOMER' : 'DRIVER',
    notify: cancelledByCustomer ? 'DRIVER' : 'CUSTOMER',
    type: 'RIDE_CANCELLED',
    title: 'Ride cancelled',
    message: `The ${cancelledByCustomer ? 'customer' : 'driver'} cancelled this ride. Reason: ${dto.reason}`,
    reason: dto.reason,
  }).catch(logNotificationFailure('ride-cancelled'));

  return cancelledRide;
};

const assertCanRaiseEmergency = async (
  requester: { id: string; role: string },
  rideId: string,
): Promise<{ id: string; status: RideStatus }> => {
  const ride = await prisma.ride.findFirst({
    where: { id: rideId, isDeleted: false },
    select: {
      id: true,
      status: true,
      customerProfile: { select: { userId: true } },
      driverProfile: { select: { userId: true } },
    },
  });

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  const isParticipant =
    ride.customerProfile.userId === requester.id || ride.driverProfile?.userId === requester.id;

  if (!isParticipant && requester.role !== 'ADMIN') {
    throw new ForbiddenError('You can only raise an emergency on your own ride.');
  }

  return { id: ride.id, status: ride.status };
};

const escalateRideToEmergency = async (ride: {
  id: string;
  status: RideStatus;
}): Promise<boolean> => {
  if (!canTransitionRide(ride.status, 'EMERGENCY')) return false;

  const result = await prisma.ride.updateMany({
    where: { id: ride.id, status: ride.status },
    data: { status: 'EMERGENCY' },
  });
  return result.count > 0;
};

const shareRide = async (
  userId: string,
  rideId: string,
): Promise<{ trackingToken: string; trackingUrl: string }> => {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      status: true,
      isDeleted: true,
      customerProfile: { select: { userId: true } },
      driverProfile: { select: { userId: true } },
    },
  });

  if (!ride || ride.isDeleted) {
    throw new NotFoundError('Ride');
  }

  assertRideParticipant(ride, userId);

  if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
    throw new BadRequestError('Ride is already completed or cancelled.');
  }

  const trackingToken = randomUUID();
  const redisKey = `tracking_token:${trackingToken}`;
  await redis.setex(redisKey, TRACKING_TOKEN_TTL_SECONDS, rideId);

  return {
    trackingToken,
    trackingUrl: `${TRACKING_BASE_URL}/${trackingToken}`,
  };
};

//

//

const rideBaseSelect = {
  id: true,
  status: true,
  vehicleClass: true,
  vehicleType: true,
  pickupAddress: true,
  pickupLatitude: true,
  pickupLongitude: true,
  dropoffAddress: true,
  dropoffLatitude: true,
  dropoffLongitude: true,
  estimatedFare: true,
  finalFare: true,
  estimatedDistance: true,
  estimatedDuration: true,
  distanceKm: true,
  durationMinutes: true,
  scheduledAt: true,
  requestedAt: true,
  acceptedAt: true,
  arrivedAt: true,
  startedAt: true,
  completedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RideSelect;

const participantUserSelect = { select: { firstName: true, lastName: true } } as const;
const adminUserSelect = {
  select: { id: true, firstName: true, lastName: true, email: true, phone: true },
} as const;

const rideSelectFor = (role: string) => {
  if (role === 'ADMIN') {
    return {
      ...rideBaseSelect,
      customerProfile: { select: { id: true, user: adminUserSelect } },
      driverProfile: { select: { id: true, user: adminUserSelect } },
    } satisfies Prisma.RideSelect;
  }
  if (role === 'DRIVER') {
    return {
      ...rideBaseSelect,
      customerProfile: { select: { averageRating: true, user: participantUserSelect } },
    } satisfies Prisma.RideSelect;
  }
  return {
    ...rideBaseSelect,
    driverProfile: {
      select: {
        averageRating: true,
        user: participantUserSelect,
        vehicle: {
          select: { vehicleType: true, brand: true, model: true, color: true, licensePlate: true },
        },
      },
    },
  } satisfies Prisma.RideSelect;
};

const rideScopeFor = (viewer: RideViewer): Prisma.RideWhereInput => {
  switch (viewer.role) {
    case 'CUSTOMER':
      return { customerProfile: { userId: viewer.id } };
    case 'DRIVER':
      return { driverProfile: { userId: viewer.id } };
    case 'ADMIN':
      return {};
    default:
      throw new ForbiddenError('Your role cannot view rides.');
  }
};

const listRides = async (viewer: RideViewer, query: ListRidesQuery) => {
  const { page, limit, status, userId } = query;

  const where: Prisma.RideWhereInput = {
    isDeleted: false,
    ...rideScopeFor(viewer),
    ...(status && { status }),

    ...(viewer.role === 'ADMIN' &&
      userId && {
        OR: [{ customerProfile: { userId } }, { driverProfile: { userId } }],
      }),
  };

  const [rides, total] = await prisma.$transaction([
    prisma.ride.findMany({
      where,
      select: rideSelectFor(viewer.role),
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.ride.count({ where }),
  ]);

  return { rides, meta: buildPaginationMeta(total, page, limit) };
};

const getRide = async (viewer: RideViewer, rideId: string) => {
  const ride = await prisma.ride.findFirst({
    where: { id: rideId, isDeleted: false, ...rideScopeFor(viewer) },
    select: {
      ...rideSelectFor(viewer.role),
      stops: {
        orderBy: { sequence: 'asc' },
        select: { id: true, address: true, lat: true, lng: true, sequence: true, status: true },
      },
    },
  });

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  return ride;
};

const cancelRideByAdmin = async (rideId: string, payload: AdminCancelRideInput) => {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { customerProfile: true, driverProfile: true },
  });

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
    throw new ConflictError(`Ride is already ${ride.status} and cannot be cancelled.`);
  }

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
      throw new ConflictError(
        'The ride was modified by another request. Please refresh and try again.',
      );
    }

    if (ride.driverProfileId) {
      await tx.driverProfile.update({
        where: { id: ride.driverProfileId },
        data: { isAvailable: true },
      });
    }

    return tx.ride.findUniqueOrThrow({ where: { id: rideId } });
  });

  NotificationService.emitRideStatus({
    rideId,
    status: 'CANCELLED',
    updatedBy: 'ADMIN',
    reason: payload.reason,
  });

  void NotificationService.dispatch({
    userId: ride.customerProfile.userId,
    type: 'RIDE_CANCELLED',
    title: 'Ride Cancelled by Support',
    message: `Your ride was cancelled by an admin. Reason: ${payload.reason}`,
    data: { rideId },
  }).catch(logNotificationFailure('admin-cancel-customer'));

  if (ride.driverProfile) {
    void NotificationService.dispatch({
      userId: ride.driverProfile.userId,
      type: 'RIDE_CANCELLED',
      title: 'Ride Cancelled by Support',
      message: `The current ride was cancelled by an admin. Reason: ${payload.reason}`,
      data: { rideId },
    }).catch(logNotificationFailure('admin-cancel-driver'));
  }

  return updatedRide;
};

export const RideService = {
  cancelRideByAdmin,
  listRides,
  getRide,
  updateDriverLocation,
  findNearbyDrivers,
  estimateFare,
  requestRide,
  canTransitionRide,
  assertRideTransition,
  acceptRide,
  updateRideStatus,
  cancelRide,
  assertCanRaiseEmergency,
  escalateRideToEmergency,
  shareRide,
};
