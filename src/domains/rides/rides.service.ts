import { VehicleType } from '@prisma/client';
import prisma from '../../config/db';
import { LocationService } from '../../utils/redis';
import type {
  UpdateLocationDto,
  SearchRideDto,
  EstimateFareDto,
  RequestRideDto,
} from './rides.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Private Geo Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Haversine formula — returns the great-circle distance in kilometres between
 * two WGS-84 coordinates. Accurate enough for fare estimation (±0.5%).
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.asin(Math.sqrt(a));
}

// ─────────────────────────────────────────────────────────────────────────────
// Fare Configuration
// Rates are hardcoded here; move to a DB/config table in production.
// ─────────────────────────────────────────────────────────────────────────────

interface FareConfig {
  vehicleClass: string;
  vehicleType: VehicleType;
  baseFare: number;
  perKmRate: number;
  /** Estimated average speed in km/h — used for duration estimate */
  avgSpeedKmh: number;
}

const FARE_CONFIGS: FareConfig[] = [
  { vehicleClass: 'ECONOMY', vehicleType: VehicleType.Hatchback, baseFare: 2.0, perKmRate: 1.5, avgSpeedKmh: 30 },
  { vehicleClass: 'ECONOMY', vehicleType: VehicleType.Micro,     baseFare: 1.5, perKmRate: 1.2, avgSpeedKmh: 30 },
  { vehicleClass: 'COMFORT', vehicleType: VehicleType.Sedan,     baseFare: 3.0, perKmRate: 2.0, avgSpeedKmh: 35 },
  { vehicleClass: 'PREMIUM', vehicleType: VehicleType.SUV,       baseFare: 5.0, perKmRate: 3.0, avgSpeedKmh: 40 },
];

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
// Fare Estimation
// ─────────────────────────────────────────────────────────────────────────────

export interface FareEstimate {
  vehicleClass: string;
  vehicleType: string;
  distanceKm: number;
  estimatedFare: number;
  estimatedDurationMinutes: number;
}

/**
 * Returns one fare option per configured vehicle tier.
 *
 * Formula per tier: estimatedFare = baseFare + (distanceKm * perKmRate)
 * Duration:         ceil(distanceKm / avgSpeedKmh * 60)   [minutes]
 */
export function estimateFare(dto: EstimateFareDto): FareEstimate[] {
  const distanceKm = parseFloat(
    haversineKm(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng).toFixed(2),
  );

  return FARE_CONFIGS.map((cfg) => ({
    vehicleClass: cfg.vehicleClass,
    vehicleType: cfg.vehicleType,
    distanceKm,
    estimatedFare: parseFloat((cfg.baseFare + distanceKm * cfg.perKmRate).toFixed(2)),
    estimatedDurationMinutes: Math.ceil((distanceKm / cfg.avgSpeedKmh) * 60),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Ride Request & Dispatch
// ─────────────────────────────────────────────────────────────────────────────

export interface RequestRideResult {
  ride: Awaited<ReturnType<typeof createRideRecord>>;
  dispatchedDriverIds: string[];
}

/** Private helper — keeps the return-type inference clean */
async function createRideRecord(
  customerId: string,
  dto: RequestRideDto,
) {
  return prisma.ride.create({
    data: {
      customerId,
      pickupAddress: dto.pickupAddress,
      pickupLatitude: dto.pickupLat,
      pickupLongitude: dto.pickupLng,
      dropoffAddress: dto.dropoffAddress,
      dropoffLatitude: dto.dropoffLat,
      dropoffLongitude: dto.dropoffLng,
      vehicleType: dto.vehicleType,
      estimatedFare: dto.estimatedFare,
      status: 'REQUESTED',
    },
    include: {
      customerProfile: { select: { userId: true } },
    },
  });
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
export async function requestRide(
  userId: string,
  dto: RequestRideDto,
): Promise<RequestRideResult> {
  // 1. Resolve CustomerProfile
  const customerProfile = await prisma.customerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!customerProfile) {
    throw new Error('CUSTOMER_PROFILE_NOT_FOUND');
  }

  // 2. Persist the ride
  const ride = await createRideRecord(customerProfile.id, dto);

  // 3. Geospatial candidate lookup from Redis
  const candidateUserIds = await LocationService.findNearbyDrivers(
    dto.pickupLng,
    dto.pickupLat,
    5,
  );

  let dispatchedDriverIds: string[] = [];

  if (candidateUserIds.length > 0) {
    // 4. Postgres filter: available + matching vehicle type
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

  return { ride, dispatchedDriverIds };
}
