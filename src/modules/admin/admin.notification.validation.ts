import { z } from 'zod';

export const BroadcastNotificationSchema = z.object({
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  targetRole: z.enum(['CUSTOMER', 'DRIVER', 'ALL']),
});
export type BroadcastNotificationInput = z.infer<typeof BroadcastNotificationSchema>;
