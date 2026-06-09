import { VehicleType } from '@prisma/client';
import prisma from '../../config/db';

// Single source of truth for all fare arithmetic. Both the estimate endpoint
// and the trip-completion flow call this engine so the numbers are consistent.

// ── Rate table ────────────────────────────────────────────────────────────────

// Removed TIER_RATES (migrated to DB)

// ── Fixed fees (applied on top of all tiers) ──────────────────────────────────

const SERVICE_FEE = 0.50;   // USD flat
const TAX_RATE    = 0.05;   // 5%

// ── Fare Breakdown shape ──────────────────────────────────────────────────────

export interface FareBreakdown {
  vehicleType: string;
  vehicleClass: string;
  // Inputs
  distanceKm: number;
  estimatedDurationMinutes: number;
  surgeMultiplier: number;
  // Line items
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  subtotal: number;          // base + distance + time (before surge)
  surgeAmount: number;       // subtotal * (surge - 1)
  serviceFee: number;
  taxAmount: number;
  // Promo
  promoCode: string | null;
  discountAmount: number;
  // Final
  grandTotal: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Validate and return a promo code record, or null if invalid / not found.
 */
async function resolvePromoCode(code: string | undefined) {
  if (!code) return null;

  return prisma.promoCode.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      discountType: true,
      discountPercent: true,
      discountAmount: true,
      maxUses: true,
      usedCount: true,
      validUntil: true,
      validFrom: true,
      isActive: true,
      minimumFareAmount: true,
    },
  });
}

/**
 * Core arithmetic — shared by both estimate and final-fare paths.
 *
 * @param vehicleType      Prisma VehicleType enum value
 * @param distanceKm       Actual or estimated distance
 * @param durationMinutes  Actual or estimated duration
 * @param surgeMultiplier  Default 1.0
 * @param tolls            Optional extra charges (tolls, waiting time, etc.)
 * @param promoCode        Optional promo code string
 */
async function computeFare(
  vehicleType: VehicleType,
  distanceKm: number,
  durationMinutes: number,
  surgeMultiplier: number = 1.0,
  tolls: number = 0,
  promoCode?: string,
): Promise<FareBreakdown> {
  const rule = await prisma.pricingRule.findUnique({
    where: { vehicleType }
  });

  if (!rule) {
    throw new Error(`UNSUPPORTED_VEHICLE_TYPE:${vehicleType}`);
  }

  // Map the rule to the expected class (fallback mapping since class isn't in rule directly)
  const vehicleClassMap: Record<string, string> = {
    Hatchback: 'ECONOMY', Micro: 'ECONOMY', Motorcycle: 'ECONOMY',
    Sedan: 'COMFORT', PickupTruck: 'COMFORT',
    SUV: 'PREMIUM'
  };
  const vehicleClass = vehicleClassMap[vehicleType as string] || 'ECONOMY';

  // ── Line items ────────────────────────────────────────────────────────────
  const baseFare     = round2(rule.baseFare);
  const distanceFare = round2(distanceKm * rule.perKmRate);
  const timeFare     = round2(durationMinutes * rule.perMinRate);
  const subtotal     = round2(baseFare + distanceFare + timeFare);
  const surgeAmount  = round2(subtotal * (surgeMultiplier - 1));
  const afterSurge   = round2(subtotal + surgeAmount + tolls);
  const serviceFee   = SERVICE_FEE;
  const taxAmount    = round2((afterSurge + serviceFee) * TAX_RATE);

  // ── Promo code ────────────────────────────────────────────────────────────
  const promo = await resolvePromoCode(promoCode);
  let discount = 0;
  let appliedCode: string | null = null;

  if (promo) {
    const now = new Date();
    const isValid =
      promo.isActive &&
      promo.validFrom <= now &&
      promo.validUntil >= now &&
      (promo.maxUses === null || promo.usedCount < promo.maxUses);

    if (isValid) {
      appliedCode = promo.code;
      if (promo.discountType === 'PERCENTAGE' && promo.discountPercent !== null) {
        discount = round2((afterSurge + serviceFee + taxAmount) * (promo.discountPercent / 100));
      } else if (promo.discountAmount !== null) {
        discount = round2(Number(promo.discountAmount));
      }
    }
  }

  const grandTotal = round2(Math.max(0, afterSurge + serviceFee + taxAmount - discount));

  return {
    vehicleType,
    vehicleClass,
    distanceKm: round2(distanceKm),
    estimatedDurationMinutes: Math.ceil(durationMinutes),
    surgeMultiplier,
    baseFare,
    distanceFare,
    timeFare,
    subtotal,
    surgeAmount,
    serviceFee,
    taxAmount,
    promoCode: appliedCode,
    discountAmount: discount,
    grandTotal,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export const PricingEngine = {
  /**
   * Calculate an upfront fare estimate for a given route.
   *
   * Uses the Haversine distance and estimated duration (from avgSpeedKmh).
   * Returns one FareBreakdown per vehicle type, or a single one if a
   * specific vehicleType is requested.
   */
  async calculateEstimate(
    pickupLat: number,
    pickupLng: number,
    dropoffLat: number,
    dropoffLng: number,
    vehicleType?: VehicleType,
    promoCode?: string,
    surgeMultiplier: number = 1.0,
  ): Promise<FareBreakdown[]> {
    const distanceKm = haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);

    // Fetch active rules from DB
    let rules = await prisma.pricingRule.findMany();
    if (vehicleType) {
      rules = rules.filter(r => r.vehicleType === vehicleType);
    }

    // Default average speeds for duration estimate
    const speedMap: Record<string, number> = {
      Hatchback: 30, Micro: 30, Sedan: 35, SUV: 40, Motorcycle: 35, PickupTruck: 30
    };

    return Promise.all(
      rules.map((rule) => {
        const avgSpeedKmh = speedMap[rule.vehicleType as string] || 30;
        const durationMinutes = (distanceKm / avgSpeedKmh) * 60;
        return computeFare(rule.vehicleType, distanceKm, durationMinutes, surgeMultiplier, 0, promoCode);
      }),
    );
  },

  /**
   * Calculate the final, authoritative fare at trip completion.
   *
   * Uses actual GPS-measured distance, actual elapsed time, and any
   * extra charges (tolls, waiting time).
   */
  async calculateFinalFare(
    vehicleType: VehicleType,
    actualDistanceKm: number,
    actualDurationMinutes: number,
    options: {
      tolls?: number;
      waitingTimeMinutes?: number;
      surgeMultiplier?: number;
      promoCode?: string;
    } = {},
  ): Promise<FareBreakdown> {
    const {
      tolls = 0,
      waitingTimeMinutes = 0,
      surgeMultiplier = 1.0,
      promoCode,
    } = options;

    // Waiting time is billed at the per-minute rate on top of driving time
    const totalMinutes = actualDurationMinutes + waitingTimeMinutes;

    return computeFare(vehicleType, actualDistanceKm, totalMinutes, surgeMultiplier, tolls, promoCode);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Haversine — exported so rides.service can still use it without circular deps
// ─────────────────────────────────────────────────────────────────────────────

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
