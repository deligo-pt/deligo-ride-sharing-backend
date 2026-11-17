import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import prisma from '../../config/db';
import { LocationService, redis } from '../../utils/redis';
import { PricingEngine } from './pricing.service';
import { getMultiStopRouteData } from '../../utils/map.service';
import { addScheduledRideJob } from '../../queues/ride.queue';
import type {
  UpdateLocationDto,
  SearchRideDto,
  EstimateFareDto,
  RequestRideDto,
  UpdateRideStatusDto,
  CancelRideDto,
} from './rides.validation';
import { generateAndSendReceipt } from './receipt.service';

// ─────────────────────────────────────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist the driver's live coordinates in Redis AND Postgres.
 */
export async function updateDriverLocation(
  driverId: string,
  dto: UpdateLocationDto,
): Promise<void> {
  // 1. Update fast, ephemeral geospatial index in Redis
  await LocationService.updateDriverLocation(driverId, dto.lng, dto.lat);

  // 2. Persist to Postgres so it's visible in Prisma Studio / Admin DB
  await prisma.driverProfile.update({
    where: { userId: driverId },
    data: {
      currentLatitude: dto.lat,
      currentLongitude: dto.lng,
    },
  });
}

/**
 * Find available, KYC-approved drivers near a pickup point.
 */
export async function findNearbyDrivers(dto: SearchRideDto) {
  const candidateIds = await LocationService.findNearbyDrivers(dto.pickupLng, dto.pickupLat, 5);

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
}

// ─────────────────────────────────────────────────────────────────────────────
// Fare Estimation — PRD 3.7
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns one itemised FareBreakdown per vehicle tier (or a single one
 * if vehicleType is specified). Promo code is validated and applied inside
 * PricingEngine.
 */
export async function estimateFare(userId: string, dto: EstimateFareDto) {
  const estimates = await PricingEngine.calculateEstimate(
    dto.pickupLat,
    dto.pickupLng,
    dto.dropoffLat,
    dto.dropoffLng,
    dto.vehicleType,
    dto.promoCode,
    1.0,
    dto.stops, // pass intermediate stops for multi-stop pricing
  );

  await redis.set(`fare_estimate:${userId}`, JSON.stringify(estimates), 'EX', 300); // 5 min TTL

  return estimates;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ride Request & Dispatch
// ─────────────────────────────────────────────────────────────────────────────

export interface RequestRideResult {
  ride: Awaited<ReturnType<typeof prisma.ride.create>>;
  dispatchedDriverIds: string[];
  scheduled: boolean;
}

/**
 * Create a Ride record and dispatch it to nearby, eligible drivers.
 *
 * Flow:
 *  1. Resolve the CustomerProfile.id from the authenticated user's userId.
 *  2. Persist the Ride row in Postgres with status = REQUESTED.
 *  3. Ask Redis for driver IDs within 5 km of the pickup point.
 *  4. Filter those IDs in Postgres: isAvailable = true AND vehicle.vehicleType
 *     matches what the customer requested.
 *  5. Return the Ride + the list of dispatched driver IDs (the caller /
 *     future socket layer uses these to push notifications).
 */
export async function requestRide(userId: string, dto: RequestRideDto): Promise<RequestRideResult> {
  // 1. Resolve CustomerProfile
  const customerProfile = await prisma.customerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!customerProfile) {
    throw new Error('CUSTOMER_PROFILE_NOT_FOUND');
  }

  const activeRide = await prisma.ride.findFirst({
    where: {
      customerId: customerProfile.id,
      status: { in: ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS', 'DRIVER_ARRIVED'] },
    },
  });

  if (activeRide) {
    throw new Error('CUSTOMER_HAS_ACTIVE_RIDE');
  }

  const estimateKey = `fare_estimate:${userId}`;

  const estimateCache = await redis.get(estimateKey);

  if (dto.estimatedFare !== JSON.parse(estimateCache ?? 'null')?.[0]?.subtotal) {
    throw new Error('ESTIMATED_FARE_MISMATCH');
  }

  // 2. Build full coordinate chain and fetch cumulative route data
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

  // 3. Persist Ride + RideStops atomically in a transaction
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

  // ── SCHEDULED path ──────────────────────────────────────────────────────────
  if (dto.scheduledAt) {
    await addScheduledRideJob(ride.id, dto.scheduledAt);
    return { ride, dispatchedDriverIds: [], scheduled: true };
  }

  // ── ON-DEMAND path ────────────────────────────────────────────────────────
  const candidateUserIds = await LocationService.findNearbyDrivers(dto.pickupLng, dto.pickupLat, 5);

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

  return { ride, dispatchedDriverIds, scheduled: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Driver Acceptance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically accept a ride and mark the driver as unavailable.
 *
 * Uses a Prisma interactive transaction so both writes succeed or both fail —
 * preventing a ghost acceptance where the ride is claimed but the driver
 * stays available (or vice-versa).
 */
export async function acceptRide(driverUserId: string, rideId: string) {
  // 1. Verify ride exists and is still REQUESTED
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: { id: true, status: true },
  });

  if (!ride) {
    throw new Error('RIDE_NOT_FOUND');
  }

  if (ride.status !== 'REQUESTED') {
    throw new Error('RIDE_NOT_AVAILABLE');
  }

  // 2. Resolve driver profile
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: driverUserId, isAvailable: true },
    select: { id: true },
  });

  if (!driverProfile) {
    throw new Error('DRIVER_NOT_AVAILABLE');
  }

  // 3. Atomic transaction: claim ride + lock driver
  const updatedRide = await prisma.$transaction(async (tx) => {
    const update = await tx.ride.updateMany({
      where: { id: rideId },
      data: {
        status: 'ACCEPTED',
        driverProfileId: driverProfile.id,
        acceptedAt: new Date(),
      },
    });

    if (update.count === 0) {
      throw new Error('RIDE_NOT_AVAILABLE');
    }

    await tx.driverProfile.update({
      where: { id: driverProfile.id },
      data: { isAvailable: false },
    });

    return tx.ride.findUniqueOrThrow({ where: { id: rideId } });
  });

  return updatedRide;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Trip Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map each allowed status transition to its timestamp field.
 */
const STATUS_TIMESTAMP_MAP = {
  DRIVER_ARRIVED: 'arrivedAt',
  IN_PROGRESS: 'startedAt',
  COMPLETED: 'completedAt',
} as const;

/**
 * Advance the ride through its lifecycle.
 *
 * - Verifies the requesting driver is the one assigned to the ride.
 * - Sets the appropriate timestamp for the new status.
 * - On COMPLETED: puts the driver back on the map and increments totalRides
 *   for both the driver and the customer.
 */
export async function updateRideStatus(
  driverUserId: string,
  rideId: string,
  dto: UpdateRideStatusDto,
) {
  // 1. Fetch full ride to validate ownership and current status
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { customerProfile: { select: { id: true } } },
  });

  if (!ride || ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
    throw new Error('RIDE_NOT_FOUND');
  }

  // 2. Resolve driver profile and verify ownership
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: driverUserId },
    select: { id: true },
  });

  if (!driverProfile || ride.driverProfileId !== driverProfile.id) {
    throw new Error('RIDE_FORBIDDEN');
  }

  // 3. Build the timestamp field to set
  const timestampField = STATUS_TIMESTAMP_MAP[dto.status];

  // 4. Base ride update payload
  const rideUpdateData: Parameters<typeof prisma.ride.update>[0]['data'] = {
    status: dto.status,
    [timestampField]: new Date(),
    ...(dto.finalDistanceKm !== undefined && { distanceKm: dto.finalDistanceKm }),
    ...(dto.finalDurationMinutes !== undefined && { durationMinutes: dto.finalDurationMinutes }),
  };

  if (dto.status !== 'COMPLETED') {
    // Simple status advance — single update
    return {
      ride: await prisma.ride.update({ where: { id: rideId }, data: rideUpdateData }),
      fareBreakdown: null,
    };
  }

  // 5. COMPLETED: calculate final fare via PricingEngine
  const actualDistKm = dto.actualDistanceKm ?? dto.finalDistanceKm ?? 1;
  const actualDurMin = dto.actualDurationMinutes ?? dto.finalDurationMinutes ?? 10;

  const fareBreakdown = await PricingEngine.calculateFinalFare(
    ride.vehicleType,
    actualDistKm,
    actualDurMin,
    {
      tolls: dto.tolls,
      waitingTimeMinutes: dto.waitingTimeMinutes,
    },
  );

  // 6. Persist final fare into rideUpdateData
  rideUpdateData.finalFare = fareBreakdown.grandTotal;
  rideUpdateData.distanceKm = fareBreakdown.distanceKm;
  rideUpdateData.durationMinutes = fareBreakdown.estimatedDurationMinutes;

  // 7. Transaction: finalise ride + release driver + increment totalRides
  const [updatedRide] = await prisma.$transaction([
    prisma.ride.update({ where: { id: rideId }, data: rideUpdateData }),
    prisma.driverProfile.update({
      where: { id: driverProfile.id },
      data: { isAvailable: true, totalRides: { increment: 1 } },
    }),
    prisma.customerProfile.update({
      where: { id: ride.customerProfile.id },
      data: { totalRides: { increment: 1 } },
    }),
  ]);

  // Fire-and-forget: send receipt email + SMS — does NOT block the API response
  void generateAndSendReceipt(rideId);

  return { ride: updatedRide, fareBreakdown };

  // Note: receipt generation is done OUTSIDE the transaction above
  // to ensure the API response is never delayed.
}

/**
 * Cancel a ride (by either the customer or an assigned driver).
 *
 * If a driver was already assigned, they are released back to the pool.
 */
export async function cancelRide(userId: string, rideId: string, dto: CancelRideDto) {
  // 1. Fetch the ride with just enough data for the teardown
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      status: true,
      driverProfileId: true,
      customerProfile: { select: { userId: true } },
      driverProfile: { select: { userId: true } },
    },
  });

  if (!ride) {
    throw new Error('RIDE_NOT_FOUND');
  }

  if (ride.customerProfile.userId !== userId && ride.driverProfile?.userId !== userId) {
    throw new Error('RIDE_FORBIDDEN');
  }

  // Prevent cancelling an already-terminal ride
  if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
    throw new Error('RIDE_ALREADY_TERMINAL');
  }

  // 2. Ride update is always required — build a typed PrismaPromise array
  const updates: Prisma.PrismaPromise<unknown>[] = [
    prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      },
    }),
  ];

  // 3. Release the driver back to the pool only if one was assigned
  if (ride.driverProfileId) {
    updates.push(
      prisma.driverProfile.update({
        where: { id: ride.driverProfileId },
        data: { isAvailable: true },
      }),
    );
  }

  const results = await prisma.$transaction(updates);
  return results[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// PRD 3.5: Trip Sharing
// ─────────────────────────────────────────────────────────────────────────────

const TRACKING_TOKEN_TTL_SECONDS = 86_400; // 24 hours
const TRACKING_BASE_URL = 'https://deligo.com/track';

/**
 * Generate a one-time tracking token for a ride and persist it in Redis.
 *
 * Flow:
 *  1. Resolve the customer’s CustomerProfile to verify ride ownership.
 *  2. Confirm the ride is in an active (non-terminal) state.
 *  3. Generate a UUID token, write it to Redis with a 24-hour TTL.
 *  4. Return the public tracking URL the customer can share.
 *
 * A read-only guest may later present this token to join the Socket.io room
 * without a driver or customer account.
 */
export async function shareRide(
  userId: string,
  rideId: string,
): Promise<{ trackingToken: string; trackingUrl: string }> {
  // 1. Resolve the customer profile
  const customerProfile = await prisma.customerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!customerProfile) {
    throw new Error('CUSTOMER_PROFILE_NOT_FOUND');
  }

  // 2. Verify ride ownership and active status
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: { id: true, customerProfile: { select: { userId: true } }, status: true },
  });

  if (!ride) {
    throw new Error('RIDE_NOT_FOUND');
  }

  if (ride.customerProfile.userId !== userId) {
    throw new Error('RIDE_FORBIDDEN');
  }

  if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
    throw new Error('RIDE_ALREADY_TERMINAL');
  }

  // 3. Generate token and persist in Redis
  const trackingToken = randomUUID();
  const redisKey = `tracking_token:${trackingToken}`;
  await redis.setex(redisKey, TRACKING_TOKEN_TTL_SECONDS, rideId);

  // 4. Return the public share URL
  return {
    trackingToken,
    trackingUrl: `${TRACKING_BASE_URL}/${trackingToken}`,
  };
}
