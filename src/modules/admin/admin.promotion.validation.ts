import { z } from 'zod';

export const ListPromotionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListPromotionsQuery = z.infer<typeof ListPromotionsQuerySchema>;

export const DeactivatePromotionSchema = z.object({
  isActive: z.boolean(),
});
export type DeactivatePromotionInput = z.infer<typeof DeactivatePromotionSchema>;

export const PromoIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});
