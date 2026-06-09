import { Request, Response, NextFunction } from 'express';
import { VehicleType } from '@prisma/client';
import { successResponse } from '../../types/api.types';
import { assertAdmin } from './admin.utils';
import { listPricingRules, updatePricingRule } from './admin.pricing.service';

export const getPricingRulesHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const rules = await listPricingRules();
    res.status(200).json(successResponse(rules));
  } catch (err) {
    next(err);
  }
};

export const updatePricingRuleHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const vehicleType = req.params.vehicleType as VehicleType;
    const updated = await updatePricingRule(vehicleType, req.body);
    res.status(200).json(successResponse(updated));
  } catch (err) {
    next(err);
  }
};
