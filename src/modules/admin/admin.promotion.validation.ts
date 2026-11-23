import { z } from 'zod';

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

// ── Grouped validation (consumed by validateRequest in admin.route.ts) ─────────

export const AdminPromotionValidation = {
  list: { query: ListPromotionsQuerySchema },
  update: { params: PromoIdParamSchema, body: DeactivatePromotionSchema },
};
