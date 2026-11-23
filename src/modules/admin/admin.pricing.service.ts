import prisma from '../../config/db';
import { VehicleType } from '@prisma/client';
import { UpdatePricingRuleInput } from './admin.pricing.validation';
import { NotFoundError } from '../../utils/errors';

const listPricingRules = async () => {
  return prisma.pricingRule.findMany({
    orderBy: { vehicleType: 'asc' },
  });
};

const updatePricingRule = async (vehicleType: VehicleType, payload: UpdatePricingRuleInput) => {
  const rule = await prisma.pricingRule.findUnique({
    where: { vehicleType },
  });

  if (!rule) {
    throw new NotFoundError('PricingRule');
  }

  return prisma.pricingRule.update({
    where: { vehicleType },
    data: payload,
  });
};

export const AdminPricingService = {
  listPricingRules,
  updatePricingRule,
};
