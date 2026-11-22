import { VehicleType } from '@prisma/client';
import prisma from '../../config/db';
import { getMultiStopRouteData, type Coordinate } from '../../utils/map.service';
import { isPointInPolygon, parsePolygon } from '../../utils/geo.utils';

// Single source of truth for all fare arithmetic. Both the estimate endpoint
// and the trip-completion flow call this engine so the numbers are consistent.

// ── Rate table ────────────────────────────────────────────────────────────────

// Removed TIER_RATES (migrated to DB)

// ── Fixed fees (applied on top of all tiers) ──────────────────────────────────

const SERVICE_FEE = 0.5; // USD flat
const TAX_RATE = 0.05; // 5%

// ── Fare Breakdown shape ──────────────────────────────────────────────────────

/** A single zone surcharge applied to this fare. */
export interface ZoneSurcharge {
  zoneId: string;
  zoneName: string;
  amount: number;
}

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
  subtotal: number; // base + distance + time (before surge)
  surgeAmount: number; // subtotal * (surge - 1)
  serviceFee: number;
  taxAmount: number;
  // Zone surcharges (e.g. airport fees)
  zoneSurcharges: ZoneSurcharge[];
  zoneSurchargeTotal: number;
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
      discountValue: true,
      maxDiscountCap: true,
      minRideValue: true,
      maxGlobalUses: true,
      currentUses: true,
      validFrom: true,
      validUntil: true,
      isActive: true,
      isDeleted: true,
      deletedAt: true,

      // discountPercent: true,
      // discountAmount: true,
      // maxUses: true,
      // usedCount: true,
      // validUntil: true,
      // validFrom: true,
      // isActive: true,
      // minimumFareAmount: true,
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
  zoneSurcharges: ZoneSurcharge[] = [],
): Promise<FareBreakdown> {
  const rule = await prisma.pricingRule.findUnique({
    where: { vehicleType },
  });

  if (!rule) {
    throw new Error(`UNSUPPORTED_VEHICLE_TYPE:${vehicleType}`);
  }

  // Map the rule to the expected class (fallback mapping since class isn't in rule directly)
  const vehicleClassMap: Record<string, string> = {
    Hatchback: 'ECONOMY',
    Micro: 'ECONOMY',
    Motorcycle: 'ECONOMY',
    Sedan: 'COMFORT',
    PickupTruck: 'COMFORT',
    SUV: 'PREMIUM',
  };
  const vehicleClass = vehicleClassMap[vehicleType as string] || 'ECONOMY';

  // ── Line items ────────────────────────────────────────────────────────────
  const baseFare = round2(rule.baseFare);
  const distanceFare = round2(distanceKm * rule.perKmRate);
  const timeFare = round2(durationMinutes * rule.perMinRate);
  const subtotal = round2(baseFare + distanceFare + timeFare);
  const surgeAmount = round2(subtotal * (surgeMultiplier - 1));
  const zoneSurchargeTotal = round2(zoneSurcharges.reduce((acc, z) => acc + z.amount, 0));
  const afterSurge = round2(subtotal + surgeAmount + tolls + zoneSurchargeTotal);
  const serviceFee = SERVICE_FEE;
  const taxAmount = round2((afterSurge + serviceFee) * TAX_RATE);

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
      (promo.maxGlobalUses === null || promo.currentUses < promo.maxGlobalUses);

    if (isValid) {
      appliedCode = promo.code;
      if (promo.discountType === 'PERCENTAGE' && promo.discountValue !== null) {
        discount = round2((afterSurge + serviceFee + taxAmount) * (promo.discountValue / 100));
      } else if (promo.maxDiscountCap !== null) {
        discount = round2(Number(promo.maxDiscountCap));
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
    zoneSurcharges,
    zoneSurchargeTotal,
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
   * Accepts an optional array of intermediate `stops` between pickup and
   * dropoff. When supplied, the full coordinate chain
   * (pickup → stop1 → … → stopN → dropoff) is sent to the routing provider
   * in a single request so distance and duration are cumulative.
   *
   * Returns one FareBreakdown per vehicle type, or a single one if
   * vehicleType is given.
   */
  async calculateEstimate(
    pickupLat: number,
    pickupLng: number,
    dropoffLat: number,
    dropoffLng: number,
    vehicleType?: VehicleType,
    promoCode?: string,
    surgeMultiplier: number = 1.0,
    stops: Coordinate[] = [],
  ): Promise<FareBreakdown[]> {
    // ── Build full coordinate chain (pickup → intermediate stops → dropoff) ──
    const coordinates: Coordinate[] = [
      { lat: pickupLat, lng: pickupLng },
      ...stops,
      { lat: dropoffLat, lng: dropoffLng },
    ];

    // ── Fetch real-world route data (single API call for the full itinerary) ─
    const routeData = await getMultiStopRouteData(coordinates);
    const distanceKm = routeData.distanceMeters / 1_000;
    const durationMinutes = routeData.durationSeconds / 60;

    // ── Geofencing: find SURCHARGE zones that intersect pickup or dropoff ──
    const activeZones = await prisma.zone.findMany({
      where: { isActive: true, type: 'SURCHARGE' },
    });

    const matchedZones: ZoneSurcharge[] = [];
    const seenZoneIds = new Set<string>();

    for (const zone of activeZones) {
      if (seenZoneIds.has(zone.id)) continue;

      const polygon = parsePolygon(zone.polygon);
      if (polygon.length < 3) continue;

      const pickupHit = isPointInPolygon(pickupLat, pickupLng, polygon);
      const dropoffHit = isPointInPolygon(dropoffLat, dropoffLng, polygon);

      if (pickupHit || dropoffHit) {
        matchedZones.push({
          zoneId: zone.id,
          zoneName: zone.name,
          amount: zone.surchargeAmount,
        });
        seenZoneIds.add(zone.id);
      }
    }

    // Fetch active rules from DB
    let rules = await prisma.pricingRule.findMany();
    if (vehicleType) {
      rules = rules.filter((r) => r.vehicleType === vehicleType);
    }

    return Promise.all(
      rules.map((rule) =>
        computeFare(
          rule.vehicleType,
          distanceKm,
          durationMinutes,
          surgeMultiplier,
          0,
          promoCode,
          matchedZones,
        ),
      ),
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
    const { tolls = 0, waitingTimeMinutes = 0, surgeMultiplier = 1.0, promoCode } = options;

    // Waiting time is billed at the per-minute rate on top of driving time
    const totalMinutes = actualDurationMinutes + waitingTimeMinutes;

    return computeFare(
      vehicleType,
      actualDistanceKm,
      totalMinutes,
      surgeMultiplier,
      tolls,
      promoCode,
    );
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
