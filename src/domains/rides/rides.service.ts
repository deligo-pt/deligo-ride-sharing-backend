import prisma from '../../config/db';
import { LocationService } from '../../utils/redis';
import type { UpdateLocationDto, SearchRideDto } from './rides.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Rides Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist the driver's live coordinates in Redis.
 *
 * Delegates entirely to LocationService; the service layer is the single point
 * of contact with Redis so the controller stays clean.
 */
export async function updateDriverLocation(
  driverId: string,
  dto: UpdateLocationDto,
): Promise<void> {
  await LocationService.updateDriverLocation(driverId, dto.lng, dto.lat);
}

/**
 * Find available, KYC-approved drivers near a pickup point.
 *
 * Flow:
 *  1. Query Redis for driver IDs within `radiusInKm` of the pickup.
 *  2. Early-return an empty array if Redis yields no candidates.
 *  3. Hydrate each ID from Postgres, filtering by:
 *       - isAvailable: true
 *       - document.verificationStatus: 'APPROVED'  (KYC gate)
 *       - vehicle.approvalStatus: 'APPROVED'        (vehicle compliance gate)
 *  4. Include the connected Vehicle and the base User (name + rating).
 */
export async function findNearbyDrivers(dto: SearchRideDto) {
  const candidateIds = await LocationService.findNearbyDrivers(dto.pickupLng, dto.pickupLat, 5);

  if (candidateIds.length === 0) {
    return [];
  }

  const drivers = await prisma.driverProfile.findMany({
    where: {
      userId: { in: candidateIds },
      isAvailable: true,
      document: {
        verificationStatus: 'APPROVED',
      },
      vehicle: {
        approvalStatus: 'APPROVED',
      },
    },
    include: {
      vehicle: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  return drivers;
}
