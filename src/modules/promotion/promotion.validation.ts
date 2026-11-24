import { z } from 'zod';

const CreatePromoCodeSchema = z
  .object({
    code: z
      .string({ error: 'code is required' })
      .min(1, 'code cannot be empty')
      .transform((v) => v.toUpperCase().trim()),

    discountType: z.enum(['FLAT', 'PERCENTAGE'], {
      error: 'discountType must be FLAT or PERCENTAGE',
    }),

    discountValue: z
      .number({ error: 'discountValue is required and must be a number' })
      .positive('discountValue must be greater than 0'),

    maxDiscountCap: z.number().positive('maxDiscountCap must be greater than 0').optional(),

    minRideValue: z.number().min(0, 'minRideValue cannot be negative').optional().default(0),

    maxGlobalUses: z
      .number({ error: 'maxGlobalUses is required and must be a number' })
      .int('maxGlobalUses must be an integer')
      .positive('maxGlobalUses must be at least 1'),

    validFrom: z
      .string({ error: 'validFrom is required' })
      .datetime({ message: 'validFrom must be a valid ISO 8601 datetime' })
      .transform((v) => new Date(v)),

    validUntil: z
      .string({ error: 'validUntil is required' })
      .datetime({ message: 'validUntil must be a valid ISO 8601 datetime' })
      .transform((v) => new Date(v)),

    isActive: z.boolean().optional().default(true),
  })
  .refine((data) => data.validUntil > data.validFrom, {
    message: 'validUntil must be after validFrom',
    path: ['validUntil'],
  })
  .refine((data) => !(data.discountType === 'FLAT' && data.maxDiscountCap !== undefined), {
    message: 'maxDiscountCap is only applicable for PERCENTAGE discount types',
    path: ['maxDiscountCap'],
  });

export type CreatePromoCodeDto = z.infer<typeof CreatePromoCodeSchema>;

const ValidatePromoCodeSchema = z.object({
  code: z
    .string({ error: 'code is required' })
    .min(1, 'code cannot be empty')
    .transform((v) => v.toUpperCase().trim()),

  estimatedFare: z
    .number({ error: 'estimatedFare is required and must be a number' })
    .positive('estimatedFare must be greater than 0'),
});

export type ValidatePromoCodeDto = z.infer<typeof ValidatePromoCodeSchema>;

const ListPromotionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListPromotionsQuery = z.infer<typeof ListPromotionsQuerySchema>;

const DeactivatePromotionSchema = z.object({
  isActive: z.boolean(),
});
export type DeactivatePromotionInput = z.infer<typeof DeactivatePromotionSchema>;

const PromoIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const PromotionValidation = {
  create: { body: CreatePromoCodeSchema },
  validate: { body: ValidatePromoCodeSchema },
  list: { query: ListPromotionsQuerySchema },
  update: { params: PromoIdParamSchema, body: DeactivatePromotionSchema },
};
