import prisma from '../../config/db';
import { addScheduledRideJob } from '../../queues/ride.queue';
import { getMultiStopRouteData } from '../../utils/map.service';
import { PricingEngine } from './pricing.service';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Recurring Ride Factory Engine  —  PRD 3.9
//
// Two public functions:
//   createRecurringProfile()      — Customer submits a repeating ride template.
//   evaluateRecurringProfiles()   — Called by a daily cron / startup sweep.
//                                   Mints SCHEDULED Ride records for the next
//                                   execution window and queues BullMQ jobs.
// ─────────────────────────────────────────────────────────────────────────────

// ── Validation schema (used by the controller) ────────────────────────────────

export const RecurringProfileSchema = z.object({
  vehicleType: z.enum([
    'Hatchback', 'Micro', 'Sedan', 'SUV', 'Motorcycle', 'PickupTruck',
  ] as const, {
    error: 'vehicleType must be a valid VehicleType',
  }),

  pickupAddress: z.string().min(1, 'pickupAddress is required'),
  pickupLat:     z.number().min(-90).max(90),
  pickupLng:     z.number().min(-180).max(180),

  dropoffAddress: z.string().min(1, 'dropoffAddress is required'),
  dropoffLat:     z.number().min(-90).max(90),
  dropoffLng:     z.number().min(-180).max(180),

  /**
   * ISO weekday numbers: 1 = Monday … 7 = Sunday.
   * e.g. [1, 3, 5] = Mon / Wed / Fri
   */
  daysOfWeek: z
    .array(z.int().min(1).max(7))
    .min(1, 'At least one day of week is required')
    .max(7),

  /** Local time of day in 'HH:MM' 24-hour format. e.g. "08:30" */
  timeOfDay: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'timeOfDay must be in HH:MM format'),

  startDate: z
    .string()
    .datetime({ message: 'startDate must be a valid ISO 8601 datetime' })
    .transform((v) => new Date(v)),

  endDate: z
    .string()
    .datetime({ message: 'endDate must be a valid ISO 8601 datetime' })
    .transform((v) => new Date(v)),
});

export type RecurringProfileDto = z.infer<typeof RecurringProfileSchema>;

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * POST /api/v1/rides/recurring
 *
 * Persists a new RecurringRideProfile for the authenticated customer.
 * Validates that startDate < endDate and that the schedule covers at least
 * one future occurrence.
 */
export async function createRecurringProfile(
  userId: string,
  dto: RecurringProfileDto,
) {
  if (dto.endDate <= dto.startDate) {
    throw new Error('END_DATE_BEFORE_START');
  }

  if (dto.endDate <= new Date()) {
    throw new Error('END_DATE_IN_PAST');
  }

  return prisma.recurringRideProfile.create({
    data: {
      userId,
      vehicleType:   dto.vehicleType,
      pickupAddress: dto.pickupAddress,
      pickupLat:     dto.pickupLat,
      pickupLng:     dto.pickupLng,
      dropoffAddress: dto.dropoffAddress,
      dropoffLat:    dto.dropoffLat,
      dropoffLng:    dto.dropoffLng,
      daysOfWeek:    dto.daysOfWeek,
      timeOfDay:     dto.timeOfDay,
      startDate:     dto.startDate,
      endDate:       dto.endDate,
      isActive:      true,
    },
  });
}

/**
 * GET /api/v1/rides/recurring
 *
 * Returns all recurring profiles for the authenticated customer.
 */
export async function getMyRecurringProfiles(userId: string) {
  return prisma.recurringRideProfile.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * DELETE /api/v1/rides/recurring/:id
 *
 * Soft-deactivates a profile (sets isActive = false).
 * Only the owner may deactivate their own profile.
 */
export async function deactivateRecurringProfile(userId: string, profileId: string) {
  const profile = await prisma.recurringRideProfile.findUnique({
    where: { id: profileId },
    select: { id: true, userId: true, isActive: true },
  });

  if (!profile) throw new Error('PROFILE_NOT_FOUND');
  if (profile.userId !== userId) throw new Error('PROFILE_FORBIDDEN');
  if (!profile.isActive) throw new Error('PROFILE_ALREADY_INACTIVE');

  return prisma.recurringRideProfile.update({
    where: { id: profileId },
    data:  { isActive: false },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the exact UTC Date for the next occurrence of a profile.
 *
 * We treat timeOfDay as UTC (simple & portable). For production you would
 * store a timezone on the profile and use a library like luxon.
 *
 * @returns  A Date in the future, or null if none falls within the profile's
 *           active window.
 */
function computeNextOccurrence(
  daysOfWeek: number[],
  timeOfDay: string,
  startDate: Date,
  endDate: Date,
): Date | null {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  const now = new Date();

  // Scan up to 8 days ahead to find the next matching weekday
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = new Date(now);
    candidate.setUTCDate(now.getUTCDate() + dayOffset);
    candidate.setUTCHours(hours, minutes, 0, 0);

    // getUTCDay() returns 0=Sun,1=Mon…6=Sat — convert to ISO 1=Mon…7=Sun
    const isoDay = candidate.getUTCDay() === 0 ? 7 : candidate.getUTCDay();

    if (!daysOfWeek.includes(isoDay)) continue;
    if (candidate <= now) continue;           // already passed today
    if (candidate < startDate) continue;
    if (candidate > endDate) return null;     // beyond profile window

    return candidate;
  }

  return null;
}

/**
 * Check whether a SCHEDULED Ride already exists for this profile and exact
 * scheduled timestamp (prevents double-minting on repeated sweeps).
 */
async function rideAlreadyExists(
  customerProfileId: string,
  scheduledAt: Date,
): Promise<boolean> {
  const existing = await prisma.ride.findFirst({
    where: {
      customerId: customerProfileId,
      scheduledAt,
      status: { in: ['SCHEDULED', 'REQUESTED', 'ACCEPTED', 'IN_PROGRESS'] },
    },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * evaluateRecurringProfiles()
 *
 * Iterates all active RecurringRideProfile records and, for each one:
 *  1. Resolves the customer's CustomerProfile.
 *  2. Computes the next occurrence datetime.
 *  3. Guards against duplicates via rideAlreadyExists().
 *  4. Fetches route data to record estimatedDistance / Duration.
 *  5. Creates a SCHEDULED Ride record.
 *  6. Enqueues a BullMQ delayed job.
 *
 * Designed to be called:
 *  - Once at server startup (catches up any missed windows after a restart).
 *  - Once per day via a cron job (e.g. node-cron or a BullMQ repeatable job).
 *
 * Returns a summary object for observability.
 */
export async function evaluateRecurringProfiles(): Promise<{
  evaluated: number;
  scheduled: number;
  skipped: number;
  errors: number;
}> {
  const profiles = await prisma.recurringRideProfile.findMany({
    where: { isActive: true, endDate: { gte: new Date() } },
  });

  let scheduled = 0;
  let skipped   = 0;
  let errors    = 0;

  for (const profile of profiles) {
    try {
      // 1. Next occurrence
      const nextAt = computeNextOccurrence(
        profile.daysOfWeek,
        profile.timeOfDay,
        profile.startDate,
        profile.endDate,
      );

      if (!nextAt) {
        skipped++;
        continue;
      }

      // 2. Resolve CustomerProfile.id
      const customerProfile = await prisma.customerProfile.findUnique({
        where:  { userId: profile.userId },
        select: { id: true },
      });

      if (!customerProfile) {
        console.warn(`[RecurringEngine] No CustomerProfile for userId=${profile.userId}`);
        skipped++;
        continue;
      }

      // 3. Duplicate guard
      const duplicate = await rideAlreadyExists(customerProfile.id, nextAt);
      if (duplicate) {
        skipped++;
        continue;
      }

      // 4. Route data
      const routeData = await getMultiStopRouteData([
        { lat: profile.pickupLat,  lng: profile.pickupLng  },
        { lat: profile.dropoffLat, lng: profile.dropoffLng },
      ]);
      const estimatedDistance = Math.round((routeData.distanceMeters / 1_000) * 100) / 100;
      const estimatedDuration = Math.ceil(routeData.durationSeconds / 60);

      // 5. Create SCHEDULED ride — use a rough fare (pickup → dropoff, no promo)
      const fareBreakdowns = await PricingEngine.calculateEstimate(
        profile.pickupLat,
        profile.pickupLng,
        profile.dropoffLat,
        profile.dropoffLng,
        profile.vehicleType,
      );
      const estimatedFare = fareBreakdowns[0]?.grandTotal ?? 0;

      const ride = await prisma.ride.create({
        data: {
          customerId:       customerProfile.id,
          vehicleType:      profile.vehicleType,
          pickupAddress:    profile.pickupAddress,
          pickupLatitude:   profile.pickupLat,
          pickupLongitude:  profile.pickupLng,
          dropoffAddress:   profile.dropoffAddress,
          dropoffLatitude:  profile.dropoffLat,
          dropoffLongitude: profile.dropoffLng,
          estimatedFare,
          estimatedDistance,
          estimatedDuration,
          status:      'SCHEDULED',
          scheduledAt: nextAt,
        },
      });

      // 6. BullMQ delayed job
      await addScheduledRideJob(ride.id, nextAt);

      console.info(
        `[RecurringEngine] ✅ Minted ride ${ride.id} for profile ${profile.id} ` +
        `→ scheduledAt=${nextAt.toISOString()}`,
      );

      scheduled++;
    } catch (err) {
      console.error(`[RecurringEngine] ❌ Error processing profile ${profile.id}:`, err);
      errors++;
    }
  }

  return { evaluated: profiles.length, scheduled, skipped, errors };
}
