import { VehicleType } from '@prisma/client';
import prisma from '../../config/db';
import { getMultiStopRouteData, type Coordinate } from '../../utils/map.service';
import { isPointInPolygon, parsePolygon } from '../../utils/geo.utils';
import { InternalError } from '../../utils/errors';
import type { FareBreakdown, ZoneSurcharge } from './pricing.interface';
import { SERVICE_FEE, TAX_RATE } from './pricing.constant';

const round2 = (n: number): number => {
  return Math.round(n * 100) / 100;
};

const resolvePromoCode = async (code: string | undefined) => {
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
    },
  });
};

const computeFare = async (
  vehicleType: VehicleType,
  distanceKm: number,
  durationMinutes: number,
  surgeMultiplier: number = 1.0,
  tolls: number = 0,
  promoCode?: string,
  zoneSurcharges: ZoneSurcharge[] = [],
): Promise<FareBreakdown> => {
  const rule = await prisma.pricingRule.findUnique({
    where: { vehicleType },
  });

  if (!rule) {
    throw new InternalError(
      `No pricing rule configured for vehicle type ${vehicleType}`,
      'PRICING_RULE_NOT_FOUND',
    );
  }

  const vehicleClassMap: Record<string, string> = {
    Hatchback: 'ECONOMY',
    Micro: 'ECONOMY',
    Motorcycle: 'ECONOMY',
    Sedan: 'COMFORT',
    PickupTruck: 'COMFORT',
    SUV: 'PREMIUM',
  };
  const vehicleClass = vehicleClassMap[vehicleType as string] || 'ECONOMY';

  const baseFare = round2(rule.baseFare);
  const distanceFare = round2(distanceKm * rule.perKmRate);
  const timeFare = round2(durationMinutes * rule.perMinRate);
  const subtotal = round2(baseFare + distanceFare + timeFare);
  const surgeAmount = round2(subtotal * (surgeMultiplier - 1));
  const zoneSurchargeTotal = round2(zoneSurcharges.reduce((acc, z) => acc + z.amount, 0));
  const afterSurge = round2(subtotal + surgeAmount + tolls + zoneSurchargeTotal);
  const serviceFee = SERVICE_FEE;
  const taxAmount = round2((afterSurge + serviceFee) * TAX_RATE);

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
};

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
};

const calculateEstimate = async (
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  vehicleType?: VehicleType,
  promoCode?: string,
  surgeMultiplier: number = 1.0,
  stops: Coordinate[] = [],
): Promise<FareBreakdown[]> => {
  const coordinates: Coordinate[] = [
    { lat: pickupLat, lng: pickupLng },
    ...stops,
    { lat: dropoffLat, lng: dropoffLng },
  ];

  const routeData = await getMultiStopRouteData(coordinates);
  const distanceKm = routeData.distanceMeters / 1_000;
  const durationMinutes = routeData.durationSeconds / 60;

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
};

const calculateFinalFare = async (
  vehicleType: VehicleType,
  actualDistanceKm: number,
  actualDurationMinutes: number,
  options: {
    tolls?: number;
    waitingTimeMinutes?: number;
    surgeMultiplier?: number;
    promoCode?: string;
  } = {},
): Promise<FareBreakdown> => {
  const { tolls = 0, waitingTimeMinutes = 0, surgeMultiplier = 1.0, promoCode } = options;

  const totalMinutes = actualDurationMinutes + waitingTimeMinutes;

  return computeFare(
    vehicleType,
    actualDistanceKm,
    totalMinutes,
    surgeMultiplier,
    tolls,
    promoCode,
  );
};

export const PricingService = {
  calculateEstimate,
  calculateFinalFare,
  haversineKm,
};
