import prisma from '../../config/db';
import { buildPaginationMeta } from '../../types/api.types';
import { ListPromotionsQuery, DeactivatePromotionInput } from './admin.promotion.validation';
import { NotFoundError } from '../../utils/errors';

export const listPromotions = async (query: ListPromotionsQuery) => {
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

export const updatePromotionStatus = async (id: string, payload: DeactivatePromotionInput) => {
  const promo = await prisma.promoCode.findUnique({ where: { id } });

  if (!promo) {
    throw new NotFoundError('PromoCode');
  }

  return prisma.promoCode.update({
    where: { id },
    data: { isActive: payload.isActive },
  });
};
