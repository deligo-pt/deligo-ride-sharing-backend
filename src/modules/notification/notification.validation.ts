import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/v1/notifications ─────────────────────────────────────────────────
// Optional query params for filtering/pagination
const ListNotificationsSchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
  unread: z.enum(['true', 'false']).optional(), // 'true' => unread only; omitted/'false' => all
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsSchema>;

// ── PATCH /api/v1/notifications/:id/read ────────────────────────────────────
// No body — rideId comes from the URL param.
// (Kept here for completeness; validated in controller via String(req.params.id))

// ── PATCH /api/v1/notifications/:id/read ─────────────────────────────────────
const NotificationParamsSchema = z.object({
  id: z.string().min(1, 'Notification id is required'),
});

// ── POST /api/v1/notifications/test-sms ──────────────────────────────────────
const TestSmsBodySchema = z.object({
  phone: z.string({ error: 'phone and message are required' }).min(1, 'phone and message are required'),
  message: z.string({ error: 'phone and message are required' }).min(1, 'phone and message are required'),
});
export type TestSmsDto = z.infer<typeof TestSmsBodySchema>;

// ── Grouped validation (consumed by validateRequest in notification.route.ts) ─

const BroadcastNotificationSchema = z.object({
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  targetRole: z.enum(['CUSTOMER', 'DRIVER', 'FLEET_MANAGER', 'ALL']),
});
export type BroadcastNotificationInput = z.infer<typeof BroadcastNotificationSchema>;

// ── Grouped validation (consumed by validateRequest in the matching *.route.ts) ─────────

export const NotificationValidation = {
  list: { query: ListNotificationsSchema },
  markAsRead: { params: NotificationParamsSchema },
  testSms: { body: TestSmsBodySchema },
  broadcast: { body: BroadcastNotificationSchema },
};
