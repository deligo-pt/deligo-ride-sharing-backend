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
import { NotificationService } from '../notification/notification.service';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../types/api.types';

// ─────────────────────────────────────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist the driver's live coordinates in Redis AND Postgres.
 */
async function updateDriverLocation(
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
async function findNearbyDrivers(dto: SearchRideDto) {
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
 * PricingService.
 */
async function estimateFare(userId: string, dto: EstimateFareDto) {
  const estimates = await PricingService.calculateEstimate(
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
async function requestRide(userId: string, dto: RequestRideDto): Promise<RequestRideResult> {
  // 1. Resolve CustomerProfile
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
    throw new BadRequestError('Estimated fare does not match the latest estimate. Please request a new fare estimate.', undefined, 'ESTIMATED_FARE_MISMATCH');
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

// ─────────────────────────────────────────────────────────────────────────────
// Ride State Machine
//
// The only legal status transitions. Every mutation below goes through
// assertRideTransition() AND a conditional write (`updateMany` whose WHERE
// pins the status we validated), so a concurrent request can never push a ride
// through an illegal or duplicated transition.
//
//   SCHEDULED ─▶ REQUESTED ─▶ ACCEPTED ─▶ DRIVER_ARRIVED ─▶ IN_PROGRESS ─▶ COMPLETED
//        │            │           │              │               │
//        └────────────┴───────────┴──────────────┴───────────────┴──▶ CANCELLED
//                                 └──────────────┴───────────────┴──▶ EMERGENCY ─▶ COMPLETED | CANCELLED
// ─────────────────────────────────────────────────────────────────────────────

const RIDE_TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  SCHEDULED: ['REQUESTED', 'CANCELLED'],
  REQUESTED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['DRIVER_ARRIVED', 'CANCELLED', 'EMERGENCY'],
  DRIVER_ARRIVED: ['IN_PROGRESS', 'CANCELLED', 'EMERGENCY'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'EMERGENCY'],
  EMERGENCY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

function canTransitionRide(from: RideStatus, to: RideStatus): boolean {
  return RIDE_TRANSITIONS[from].includes(to);
}

function assertRideTransition(from: RideStatus, to: RideStatus): void {
  if (!canTransitionRide(from, to)) {
    throw new BadRequestError(`Invalid ride status transition: ${from} → ${to}.`);
  }
}

/** Thrown when a conditional write loses a race with another request. */
const rideStateConflict = () =>
  new ConflictError('The ride was modified by another request. Please refresh and try again.');

/**
 * Atomically accept a ride and mark the driver as unavailable.
 *
 * Eligibility: the driver must have an APPROVED KYC status, a non-deleted
 * profile and an ACTIVE (not suspended / deactivated) user account — otherwise a
 * ForbiddenError is thrown. The same conditions are repeated inside the
 * driver-lock UPDATE, so a suspension that lands mid-request is still honoured.
 *
 * Concurrency: the ride is claimed with a single conditional UPDATE
 * (`WHERE id = ? AND status = 'REQUESTED' AND driverProfileId IS NULL`). Postgres
 * row-locks the target, so when two drivers race only one UPDATE matches a row —
 * the loser sees count = 0 and the whole transaction (including the driver lock)
 * rolls back. The driver is claimed the same way (`isAvailable = true` in the
 * WHERE), so one driver cannot accept two rides at once either.
 */
async function acceptRide(driverUserId: string, rideId: string) {
  return prisma.$transaction(async (tx) => {
    // 1. Resolve the driver profile + eligibility (404 vs 403 vs "busy" decided here)
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

    // 2. Lock the driver (eligibility re-checked atomically)
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

    // 3. Claim the ride
    const claim = await tx.ride.updateMany({
      where: { id: rideId, status: 'REQUESTED', driverProfileId: null, isDeleted: false },
      data: {
        status: 'ACCEPTED',
        driverProfileId: driverProfile.id,
        acceptedAt: new Date(),
      },
    });

    if (claim.count === 0) {
      // Throwing rolls back the driver lock above.
      const exists = await tx.ride.findUnique({ where: { id: rideId }, select: { id: true } });
      throw exists ? new BadRequestError('Ride is no longer available for acceptance.') : new NotFoundError('Ride');
    }

    return tx.ride.findUniqueOrThrow({ where: { id: rideId } });
  });
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
 * - Validates the transition against the state machine.
 * - Writes with a conditional UPDATE pinned to the status that was validated, so
 *   a concurrent cancel / duplicate request cannot slip through (→ 409).
 * - On COMPLETED: puts the driver back on the map and increments totalRides
 *   for both the driver and the customer — in the same transaction, exactly once.
 */
async function updateRideStatus(
  driverUserId: string,
  rideId: string,
  dto: UpdateRideStatusDto,
) {
  // 1. Fetch full ride to validate ownership and current status
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { customerProfile: { select: { id: true } } },
  });

  if (!ride || ride.isDeleted) {
    throw new NotFoundError('Ride');
  }

  // 2. Resolve driver profile and verify ownership (before revealing any state)
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: driverUserId },
    select: { id: true },
  });

  if (!driverProfile || ride.driverProfileId !== driverProfile.id) {
    throw new ForbiddenError('You are not the assigned driver for this ride.');
  }

  // 3. State machine check
  assertRideTransition(ride.status, dto.status);

  // 4. Build the timestamp field to set
  const timestampField = STATUS_TIMESTAMP_MAP[dto.status];

  // 5. Base ride update payload
  const rideUpdateData: Prisma.RideUpdateManyMutationInput = {
    status: dto.status,
    [timestampField]: new Date(),
    ...(dto.finalDistanceKm !== undefined && { distanceKm: dto.finalDistanceKm }),
    ...(dto.finalDurationMinutes !== undefined && { durationMinutes: dto.finalDurationMinutes }),
  };

  // Optimistic lock: only apply if the ride is still in the state we validated
  // and still belongs to this driver.
  const guard = { id: rideId, status: ride.status, driverProfileId: driverProfile.id };

  if (dto.status !== 'COMPLETED') {
    // Simple status advance — single conditional update
    const updatedRide = await prisma.$transaction(async (tx) => {
      const result = await tx.ride.updateMany({ where: guard, data: rideUpdateData });
      if (result.count === 0) throw rideStateConflict();
      return tx.ride.findUniqueOrThrow({ where: { id: rideId } });
    });
    return { ride: updatedRide, fareBreakdown: null };
  }

  // 6. COMPLETED: calculate final fare via PricingService
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

  // 7. Persist final fare into rideUpdateData
  rideUpdateData.finalFare = fareBreakdown.grandTotal;
  rideUpdateData.distanceKm = fareBreakdown.distanceKm;
  rideUpdateData.durationMinutes = fareBreakdown.estimatedDurationMinutes;

  // 8. Transaction: finalise ride + release driver + increment totalRides.
  //    The conditional update guarantees the counters are bumped at most once.
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

  // Fire-and-forget: send receipt email + SMS — does NOT block the API response
  void ReceiptService.generateAndSendReceipt(rideId);

  return { ride: updatedRide, fareBreakdown };

  // Note: receipt generation is done OUTSIDE the transaction above
  // to ensure the API response is never delayed.
}

/**
 * Passes only the ride's customer or its assigned driver (compared by USER id).
 * Anyone else — including a different customer or an unassigned driver — gets 403.
 */
function assertRideParticipant(
  ride: { customerProfile: { userId: string }; driverProfile: { userId: string } | null },
  userId: string,
): void {
  const isCustomer = ride.customerProfile.userId === userId;
  const isAssignedDriver = ride.driverProfile?.userId === userId;

  if (!isCustomer && !isAssignedDriver) {
    throw new ForbiddenError('You are not a participant in this ride.');
  }
}

/**
 * Cancel a ride (by either the customer or an assigned driver).
 *
 * Only the ride's own customer or its assigned driver may cancel. The status
 * change and the driver release happen in one transaction, guarded by a
 * conditional UPDATE so a ride that was completed/cancelled/re-assigned in the
 * meantime is never overwritten (→ 409).
 */
async function cancelRide(userId: string, rideId: string, dto: CancelRideDto) {
  // 1. Fetch the ride with just enough data for the teardown
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

  // Actor ownership: only this ride's customer or assigned driver
  assertRideParticipant(ride, userId);

  // Prevent cancelling an already-terminal ride
  if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
    throw new BadRequestError('Ride is already completed or cancelled.');
  }

  assertRideTransition(ride.status, 'CANCELLED');

  return prisma.$transaction(async (tx) => {
    // Pin both the status and the assigned driver we validated above.
    const result = await tx.ride.updateMany({
      where: { id: rideId, status: ride.status, driverProfileId: ride.driverProfileId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      },
    });

    if (result.count === 0) throw rideStateConflict();

    // Release the driver back to the pool only if one was assigned
    if (ride.driverProfileId) {
      await tx.driverProfile.update({
        where: { id: ride.driverProfileId },
        data: { isAvailable: true },
      });
    }

    return tx.ride.findUniqueOrThrow({ where: { id: rideId } });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Emergency escalation (shared by the SOS flows in support + safety)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confirms the requester may raise an emergency on this ride: they must be its
 * customer, its assigned driver, or an ADMIN. Call this BEFORE creating alerts
 * or notifying anyone, so a request for someone else's ride has no side effects.
 */
async function assertCanRaiseEmergency(
  requester: { id: string; role: string },
  rideId: string,
): Promise<{ id: string; status: RideStatus }> {
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
}

/**
 * Flips a ride to EMERGENCY if the state machine allows it from the status that
 * was read. Conditional write — a ride that changed state in the meantime is
 * left alone. Returns whether the ride was actually updated.
 */
async function escalateRideToEmergency(ride: {
  id: string;
  status: RideStatus;
}): Promise<boolean> {
  if (!canTransitionRide(ride.status, 'EMERGENCY')) return false;

  const result = await prisma.ride.updateMany({
    where: { id: ride.id, status: ride.status },
    data: { status: 'EMERGENCY' },
  });
  return result.count > 0;
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
 *  1. Confirm the caller is the ride's customer or its assigned driver.
 *  2. Confirm the ride is in an active (non-terminal) state.
 *  3. Generate a UUID token, write it to Redis with a 24-hour TTL.
 *  4. Return the public tracking URL that can be shared.
 *
 * A read-only guest may later present this token to join the Socket.io room
 * without a driver or customer account.
 */
async function shareRide(
  userId: string,
  rideId: string,
): Promise<{ trackingToken: string; trackingUrl: string }> {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Role-scoped ride views  —  GET /rides, GET /rides/:id
//
//   CUSTOMER → only rides whose customerProfile.userId === caller
//   DRIVER   → only rides whose driverProfile.userId   === caller
//   ADMIN    → every ride (optional ?userId= filter)
//
// Scoping is applied inside the WHERE clause, so a record outside the caller's
// scope is indistinguishable from one that does not exist (404, no ID probing).
// ─────────────────────────────────────────────────────────────────────────────

interface RideViewer {
  id: string;
  role: string;
}

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

/** What each role is allowed to see about the OTHER party on a ride. */
function rideSelectFor(role: string) {
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
}

function rideScopeFor(viewer: RideViewer): Prisma.RideWhereInput {
  switch (viewer.role) {
    case 'CUSTOMER':
      return { customerProfile: { userId: viewer.id } };
    case 'DRIVER':
      return { driverProfile: { userId: viewer.id } };
    case 'ADMIN':
      return {};
    default:
      // Defence in depth: an unexpected role can never match any ride.
      throw new ForbiddenError('Your role cannot view rides.');
  }
}

async function listRides(viewer: RideViewer, query: ListRidesQuery) {
  const { page, limit, status, userId } = query;

  const where: Prisma.RideWhereInput = {
    isDeleted: false,
    ...rideScopeFor(viewer),
    ...(status && { status }),
    // ?userId= is an ADMIN-only filter; for everyone else it is ignored, never widening scope.
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
}

async function getRide(viewer: RideViewer, rideId: string) {
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
}

/**
 * PATCH /api/v1/rides/:id/admin-cancel  (ADMIN)
 * Force-cancels any non-terminal ride, frees the driver and notifies both parties.
 */
const cancelRideByAdmin = async (rideId: string, payload: AdminCancelRideInput) => {
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
