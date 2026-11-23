import { z } from 'zod';

const ListRidesQuerySchema = z.object({
  status: z.enum(['REQUESTED', 'ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EMERGENCY']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListRidesQuery = z.infer<typeof ListRidesQuerySchema>;

const CancelRideSchema = z.object({
  reason: z.string().min(5).max(500),
});
export type CancelRideInput = z.infer<typeof CancelRideSchema>;

const RideIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

// ── Grouped validation (consumed by validateRequest in the matching *.route.ts) ─────────

export const AdminRideValidation = {
  list: { query: ListRidesQuerySchema },
  cancel: { params: RideIdParamSchema, body: CancelRideSchema },
};
