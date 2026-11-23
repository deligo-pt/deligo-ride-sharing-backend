import { z } from 'zod';
import { NotificationType } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/v1/notifications ─────────────────────────────────────────────────
// Optional query params for filtering/pagination
const ListNotificationsSchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
  unread: z.enum(['true', 'false']).optional(), // filter by isRead = false
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsSchema>;

// ── PATCH /api/v1/notifications/:id/read ────────────────────────────────────
// No body — rideId comes from the URL param.
// (Kept here for completeness; validated in controller via String(req.params.id))

// ── Internal: NotificationService.dispatch() ───────────────────────────────────
export const NOTIFICATION_CHANNELS = ['IN_APP', 'WEBSOCKET', 'PUSH', 'SMS', 'EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface DispatchOptions {
  userId:    string;
  title:     string;
  message:   string;
  type:      NotificationType;
  channels?: NotificationChannel[];
  /** Optional structured metadata stored in the Notification.data JSON column */
  data?:     Record<string, unknown>;
  /** Optional rich HTML body used when the EMAIL channel is requested */
  emailHtml?: string;
}

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
  targetRole: z.enum(['CUSTOMER', 'DRIVER', 'ALL']),
});
export type BroadcastNotificationInput = z.infer<typeof BroadcastNotificationSchema>;

// ── Grouped validation (consumed by validateRequest in the matching *.route.ts) ─────────

export const NotificationValidation = {
  list: { query: ListNotificationsSchema },
  markAsRead: { params: NotificationParamsSchema },
  testSms: { body: TestSmsBodySchema },
  broadcast: { body: BroadcastNotificationSchema },
};
