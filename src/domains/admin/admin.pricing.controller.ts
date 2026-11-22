import { Request, Response, NextFunction } from 'express';
import { VehicleType } from '@prisma/client';
import { sendResponse } from '../../utils/sendResponse';
import { assertAdmin } from './admin.utils';
import { listPricingRules, updatePricingRule } from './admin.pricing.service';

export const getPricingRulesHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const rules = await listPricingRules();
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Pricing rules retrieved successfully',
      data: rules,
    });
  } catch (err) {
    next(err);
  }
};

export const updatePricingRuleHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const vehicleType = req.params.vehicleType as VehicleType;
    const updated = await updatePricingRule(
      vehicleType,
      req.body as Parameters<typeof updatePricingRule>[1],
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Pricing rule updated successfully',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};
