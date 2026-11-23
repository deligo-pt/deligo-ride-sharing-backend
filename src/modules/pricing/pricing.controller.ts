import { VehicleType } from '@prisma/client';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { PricingRuleService } from './pricing.service';
import { UpdatePricingRuleInput } from './pricing.validation';

/** GET /api/v1/pricing */
const getPricingRules = catchAsync(async (_req, res) => {
  const rules = await PricingRuleService.listPricingRules();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pricing rules retrieved successfully',
    data: rules,
  });
});

/** PATCH /api/v1/pricing/:vehicleType */
const updatePricingRule = catchAsync(async (req, res) => {
  const updated = await PricingRuleService.updatePricingRule(
    req.params.vehicleType as VehicleType,
    req.body as UpdatePricingRuleInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pricing rule updated successfully',
    data: updated,
  });
});

export const PricingController = {
  getPricingRules,
  updatePricingRule,
};
