import { z } from 'zod';

const BroadcastNotificationSchema = z.object({
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  targetRole: z.enum(['CUSTOMER', 'DRIVER', 'ALL']),
});
export type BroadcastNotificationInput = z.infer<typeof BroadcastNotificationSchema>;

// ── Grouped validation (consumed by validateRequest in admin.route.ts) ─────────

export const AdminNotificationValidation = {
  broadcast: { body: BroadcastNotificationSchema },
};
