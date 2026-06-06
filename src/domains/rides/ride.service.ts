import { VehicleClass, VehicleType } from '@prisma/client';
import prisma from '../../config/db';

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface RequestRideDto {
  /** The authenticated user's ID (from req.user.id via mock auth header) */
  riderUserId: string;

  // Pickup
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;

  // Dropoff
  dropoffAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;

  // Preferences
  vehicleClass?: VehicleClass;
  vehicleType?: VehicleType;
  estimatedFare: number;
  promoCode?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new Ride record.
 *
 * Flow:
 *  1. Resolve the CustomerProfile that belongs to the authenticated user.
 *  2. Optionally resolve a PromoCode by its code string.
 *  3. Insert the Ride row.
 */
export async function requestRide(dto: RequestRideDto) {
  // 1. Resolve the rider's CustomerProfile
  const customerProfile = await prisma.customerProfile.findFirst({
    where: { userId: dto.riderUserId },
    select: { id: true },
  });

  if (!customerProfile) {
    throw new Error('CUSTOMER_PROFILE_NOT_FOUND');
  }

  // 2. Optionally resolve a PromoCode
  let promoCodeId: string | undefined;
  if (dto.promoCode) {
    const promo = await prisma.promoCode.findUnique({
      where: { code: dto.promoCode },
      select: { id: true, isActive: true },
    });
    if (promo?.isActive) {
      promoCodeId = promo.id;
    }
  }

  // 3. Create the Ride
  const ride = await prisma.ride.create({
    data: {
      customerId: customerProfile.id,
      pickupAddress: dto.pickupAddress,
      pickupLatitude: dto.pickupLatitude,
      pickupLongitude: dto.pickupLongitude,
      dropoffAddress: dto.dropoffAddress,
      dropoffLatitude: dto.dropoffLatitude,
      dropoffLongitude: dto.dropoffLongitude,
      vehicleClass: dto.vehicleClass ?? VehicleClass.ECONOMY,
      vehicleType: dto.vehicleType ?? VehicleType.Hatchback,
      estimatedFare: dto.estimatedFare,
      ...(promoCodeId && { promoCodeId }),
    },
    include: {
      customerProfile: { select: { userId: true } },
    },
  });

  return ride;
}
