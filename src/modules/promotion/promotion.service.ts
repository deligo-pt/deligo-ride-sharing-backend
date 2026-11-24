import prisma from '../../config/db';
import type {
  CreatePromoCodeDto,
  ValidatePromoCodeDto,
  ListPromotionsQuery,
  DeactivatePromotionInput,
} from './promotion.validation';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../types/api.types';
import type { ValidatePromoResult } from './promotion.interface';

const createPromoCode = async (dto: CreatePromoCodeDto) => {
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
};

const validatePromoCode = async (
  userId: string,
  dto: ValidatePromoCodeDto,
): Promise<ValidatePromoResult> => {
  const promo = await prisma.promoCode.findUnique({
    where: { code: dto.code },
  });

  if (!promo || !promo.isActive) {
    throw new BadRequestError('Invalid or inactive promo code');
  }

  const now = new Date();
  if (now < promo.validFrom || now > promo.validUntil) {
    throw new BadRequestError('This promo code has expired');
  }

  if (promo.currentUses >= promo.maxGlobalUses) {
    throw new BadRequestError('This promo code has reached its usage limit');
  }

  if (dto.estimatedFare < promo.minRideValue) {
    throw new BadRequestError(
      'Your estimated fare does not meet the minimum required for this promo code',
    );
  }

  const existingUsage = await prisma.promoUsage.findFirst({
    where: { promoCodeId: promo.id, userId },
  });

  if (existingUsage) {
    throw new BadRequestError('You have already used this promo code');
  }

  let discountAmount: number;

  if (promo.discountType === 'FLAT') {
    discountAmount = promo.discountValue;
  } else {
    const rawDiscount = dto.estimatedFare * (promo.discountValue / 100);
    discountAmount =
      promo.maxDiscountCap !== null && promo.maxDiscountCap !== undefined
        ? Math.min(rawDiscount, promo.maxDiscountCap)
        : rawDiscount;
  }

  discountAmount = Math.min(discountAmount, dto.estimatedFare);

  const finalEstimatedFare = parseFloat((dto.estimatedFare - discountAmount).toFixed(2));

  return {
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    finalEstimatedFare,
    promoCodeId: promo.id,
  };
};

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
