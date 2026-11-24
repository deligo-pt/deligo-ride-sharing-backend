import prisma from '../../config/db';
import { addScheduledRideJob } from '../../queues/ride.queue';
import { getMultiStopRouteData } from '../../utils/map.service';
import { PricingService } from './pricing.service';
import type { RecurringProfileDto } from './ride.validation';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { NEXT_OCCURRENCE_SCAN_DAYS } from './recurring.constant';

const createRecurringProfile = async (userId: string, dto: RecurringProfileDto) => {
  if (dto.endDate <= dto.startDate) {
    throw new BadRequestError('endDate must be after startDate.');
  }

  if (dto.endDate <= new Date()) {
    throw new BadRequestError('endDate must be in the future.');
  }

  return prisma.recurringRideProfile.create({
    data: {
      userId,
      vehicleType: dto.vehicleType,
      pickupAddress: dto.pickupAddress,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      dropoffAddress: dto.dropoffAddress,
      dropoffLat: dto.dropoffLat,
      dropoffLng: dto.dropoffLng,
      daysOfWeek: dto.daysOfWeek,
      timeOfDay: dto.timeOfDay,
      startDate: dto.startDate,
      endDate: dto.endDate,
      isActive: true,
    },
  });
};

const getMyRecurringProfiles = async (userId: string) => {
  return prisma.recurringRideProfile.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
};

const deactivateRecurringProfile = async (userId: string, profileId: string) => {
  const profile = await prisma.recurringRideProfile.findUnique({
    where: { id: profileId },
    select: { id: true, userId: true, isActive: true },
  });

  if (!profile) throw new NotFoundError('Recurring ride profile');
  if (profile.userId !== userId) throw new ForbiddenError('You do not own this recurring profile.');
  if (!profile.isActive) throw new BadRequestError('This profile is already inactive.');

  return prisma.recurringRideProfile.update({
    where: { id: profileId },
    data: { isActive: false },
  });
};

const computeNextOccurrence = (
  daysOfWeek: number[],
  timeOfDay: string,
  startDate: Date,
  endDate: Date,
): Date | null => {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  const now = new Date();

  for (let dayOffset = 0; dayOffset <= NEXT_OCCURRENCE_SCAN_DAYS; dayOffset++) {
    const candidate = new Date(now);
    candidate.setUTCDate(now.getUTCDate() + dayOffset);
    candidate.setUTCHours(hours, minutes, 0, 0);

    const isoDay = candidate.getUTCDay() === 0 ? 7 : candidate.getUTCDay();

    if (!daysOfWeek.includes(isoDay)) continue;
    if (candidate <= now) continue;
    if (candidate < startDate) continue;
    if (candidate > endDate) return null;

    return candidate;
  }

  return null;
};

/**
 * Check whether a SCHEDULED Ride already exists for this profile and exact
 * scheduled timestamp (prevents double-minting on repeated sweeps).
 */
const rideAlreadyExists = async (
  customerProfileId: string,
  scheduledAt: Date,
): Promise<boolean> => {
  const existing = await prisma.ride.findFirst({
    where: {
      customerId: customerProfileId,
      scheduledAt,
      status: { in: ['SCHEDULED', 'REQUESTED', 'ACCEPTED', 'IN_PROGRESS'] },
    },
    select: { id: true },
  });
  return existing !== null;
};

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
const evaluateRecurringProfiles = async (): Promise<{
  evaluated: number;
  scheduled: number;
  skipped: number;
  errors: number;
}> => {
  const profiles = await prisma.recurringRideProfile.findMany({
    where: { isActive: true, endDate: { gte: new Date() } },
  });

  let scheduled = 0;
  let skipped = 0;
  let errors = 0;

  for (const profile of profiles) {
    try {
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

      const customerProfile = await prisma.customerProfile.findUnique({
        where: { userId: profile.userId },
        select: { id: true },
      });

      if (!customerProfile) {
        console.warn(`[RecurringEngine] No CustomerProfile for userId=${profile.userId}`);
        skipped++;
        continue;
      }

      const duplicate = await rideAlreadyExists(customerProfile.id, nextAt);
      if (duplicate) {
        skipped++;
        continue;
      }

      const routeData = await getMultiStopRouteData([
        { lat: profile.pickupLat, lng: profile.pickupLng },
        { lat: profile.dropoffLat, lng: profile.dropoffLng },
      ]);
      const estimatedDistance = Math.round((routeData.distanceMeters / 1_000) * 100) / 100;
      const estimatedDuration = Math.ceil(routeData.durationSeconds / 60);

      const fareBreakdowns = await PricingService.calculateEstimate(
        profile.pickupLat,
        profile.pickupLng,
        profile.dropoffLat,
        profile.dropoffLng,
        profile.vehicleType,
      );
      const estimatedFare = fareBreakdowns[0]?.grandTotal ?? 0;

      const ride = await prisma.ride.create({
        data: {
          customerId: customerProfile.id,
          vehicleType: profile.vehicleType,
          pickupAddress: profile.pickupAddress,
          pickupLatitude: profile.pickupLat,
          pickupLongitude: profile.pickupLng,
          dropoffAddress: profile.dropoffAddress,
          dropoffLatitude: profile.dropoffLat,
          dropoffLongitude: profile.dropoffLng,
          estimatedFare,
          estimatedDistance,
          estimatedDuration,
          status: 'SCHEDULED',
          scheduledAt: nextAt,
        },
      });

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
};

export const RecurringService = {
  createRecurringProfile,
  getMyRecurringProfiles,
  deactivateRecurringProfile,
  evaluateRecurringProfiles,
};
