import { z } from 'zod';
import { VehicleType } from '@prisma/client';

const UpdatePricingRuleSchema = z.object({
  baseFare: z.number().min(0).optional(),
  perKmRate: z.number().min(0).optional(),
  perMinRate: z.number().min(0).optional(),
  surgeMultiplier: z.number().min(1).max(10).optional(),
  adminFeePercentage: z.number().min(0).max(100).optional(),
});
export type UpdatePricingRuleInput = z.infer<typeof UpdatePricingRuleSchema>;

const VehicleTypeParamSchema = z.object({
  vehicleType: z.nativeEnum(VehicleType, {
    error: 'vehicleType must be a valid VehicleType enum value',
  }),
});

// ── Grouped validation (consumed by validateRequest in the matching *.route.ts) ─────────

export const PricingValidation = {
  updateRule: { params: VehicleTypeParamSchema, body: UpdatePricingRuleSchema },
};
