import prisma from '../../config/db';
import type {
  CreatePromoCodeDto,
  ValidatePromoCodeDto,
  ListPromotionsQuery,
  DeactivatePromotionInput,
} from './promotion.validation';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../types/api.types';

// ─────────────────────────────────────────────────────────────────────────────
// Promotions Service  —  PRD 3.10: Promotions & Discounts
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ValidatePromoResult {
  discountAmount: number;
  finalEstimatedFare: number;
  promoCodeId: string;
}

// ── Admin: Create PromoCode ───────────────────────────────────────────────────

/**
 * Persist a new PromoCode row.
 * The `code` value arrives already uppercased from the Zod schema transform.
 */
async function createPromoCode(dto: CreatePromoCodeDto) {
  return prisma.promoCode.create({
    data: {
      code: dto.code,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      maxDiscountCap: dto.maxDiscountCap ?? null,
      minRideValue: dto.minRideValue,
      maxGlobalUses: dto.maxGlobalUses,
      validFrom: dto.validFrom,
      validUntil: dto.validUntil,
      isActive: dto.isActive,
    },
  });
}

// ── Customer: Validate PromoCode ──────────────────────────────────────────────

/**
 * The Validation Engine.
 *
 * Runs a sequence of guards and, if all pass, returns the discount amount
 * the customer would receive — without yet recording a PromoUsage (that
 * happens only when the ride reaches COMPLETED status).
 *
 * Guard order:
 *  1. Code existence & isActive flag
 *  2. Date window (validFrom ≤ now ≤ validUntil)
 *  3. Global usage cap
 *  4. Minimum fare requirement
 *  5. Per-user uniqueness (one-time use per customer)
 *  6. Discount calculation
 *
 * Sentinel errors (caught and mapped in the controller):
 *   PROMO_NOT_FOUND | PROMO_EXPIRED | PROMO_LIMIT_REACHED |
 *   PROMO_MIN_FARE_NOT_MET | PROMO_ALREADY_USED
 */
async function validatePromoCode(
  userId: string,
  dto: ValidatePromoCodeDto,
): Promise<ValidatePromoResult> {
  // 1. Existence + active check
  const promo = await prisma.promoCode.findUnique({
    where: { code: dto.code },
  });

  if (!promo || !promo.isActive) {
    throw new BadRequestError('Invalid or inactive promo code');
  }

  // 2. Date window
  const now = new Date();
  if (now < promo.validFrom || now > promo.validUntil) {
    throw new BadRequestError('This promo code has expired');
  }

  // 3. Global usage cap
  if (promo.currentUses >= promo.maxGlobalUses) {
    throw new BadRequestError('This promo code has reached its usage limit');
  }

  // 4. Minimum fare requirement
  if (dto.estimatedFare < promo.minRideValue) {
    throw new BadRequestError(
      'Your estimated fare does not meet the minimum required for this promo code',
    );
  }

  // 5. Per-user uniqueness  (one redemption per customer, ever)
  const existingUsage = await prisma.promoUsage.findFirst({
    where: { promoCodeId: promo.id, userId },
  });

  if (existingUsage) {
    throw new BadRequestError('You have already used this promo code');
  }

  // 6. Discount calculation
  let discountAmount: number;

  if (promo.discountType === 'FLAT') {
    discountAmount = promo.discountValue;
  } else {
    // PERCENTAGE
    const rawDiscount = dto.estimatedFare * (promo.discountValue / 100);
    discountAmount =
      promo.maxDiscountCap !== null && promo.maxDiscountCap !== undefined
        ? Math.min(rawDiscount, promo.maxDiscountCap)
        : rawDiscount;
  }

  // Ensure the discount never exceeds the fare itself
  discountAmount = Math.min(discountAmount, dto.estimatedFare);

  const finalEstimatedFare = parseFloat((dto.estimatedFare - discountAmount).toFixed(2));

  return {
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    finalEstimatedFare,
    promoCodeId: promo.id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRD 3.10 — PricingService Integration Note
// ─────────────────────────────────────────────────────────────────────────────

// When a ride transitions to COMPLETED and a promoCodeId is present on the
// Ride record, PricingService.calculateFinalFare() (or the updateRideStatus
// service function in ride.service.ts) must execute the following two
// operations inside the same $transaction that settles the final fare:

//  1. Insert a PromoUsage record:
//       prisma.promoUsage.create({
//         data: {
//           promoCodeId:     ride.promoCodeId,
//           userId:          ride.customerProfile.userId,   // the payer
//           rideId:          ride.id,
//           discountApplied: <actual discount subtracted from finalFare>,
//         },
//       })

//  2. Increment PromoCode.currentUses by 1:
//       prisma.promoCode.update({
//         where: { id: ride.promoCodeId },
//         data:  { currentUses: { increment: 1 } },
//       })

// Both operations must be part of the same atomic $transaction to prevent
// counter drift if the ride update fails after the usage record is written.

// The recommended approach is to extend the transaction array in
// `updateRideStatus` (ride.service.ts, step 7) when `ride.promoCodeId`
// is truthy.
// ─────────────────────────────────────────────────────────────────────────────

const listPromotions = async (query: ListPromotionsQuery) => {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const [promotions, total] = await prisma.$transaction([
    prisma.promoCode.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.promoCode.count(),
  ]);

  return { promotions, meta: buildPaginationMeta(total, page, limit) };
};

const updatePromotionStatus = async (id: string, payload: DeactivatePromotionInput) => {
  const promo = await prisma.promoCode.findUnique({ where: { id } });

  if (!promo) {
    throw new NotFoundError('PromoCode');
  }

  return prisma.promoCode.update({
    where: { id },
    data: { isActive: payload.isActive },
  });
};

export const PromotionService = {
  createPromoCode,
  validatePromoCode,
  listPromotions,
  updatePromotionStatus,
};
