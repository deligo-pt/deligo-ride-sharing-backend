import { VehicleType } from '@prisma/client';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { AdminPricingService } from './admin.pricing.service';
import { UpdatePricingRuleInput } from './admin.pricing.validation';

/** GET /api/v1/admin/pricing */
const getPricingRules = catchAsync(async (_req, res) => {
  const rules = await AdminPricingService.listPricingRules();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pricing rules retrieved successfully',
    data: rules,
  });
});

/** PATCH /api/v1/admin/pricing/:vehicleType */
const updatePricingRule = catchAsync(async (req, res) => {
  const updated = await AdminPricingService.updatePricingRule(
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

export const AdminPricingController = {
  getPricingRules,
  updatePricingRule,
};
