import { z } from 'zod';
import { NotificationType } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/v1/notifications ─────────────────────────────────────────────────
// Optional query params for filtering/pagination
export const ListNotificationsSchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
  unread: z.enum(['true', 'false']).optional(), // filter by isRead = false
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsSchema>;

// ── PATCH /api/v1/notifications/:id/read ────────────────────────────────────
// No body — rideId comes from the URL param.
// (Kept here for completeness; validated in controller via String(req.params.id))

// ── Internal: NotificationEngine.dispatch() ───────────────────────────────────
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

// ── PATCH /api/v1/users/fcm-token ────────────────────────────────────────────
export const SaveFcmTokenSchema = z.object({
  fcmToken: z
    .string({ error: 'fcmToken is required' })
    .min(1, 'fcmToken cannot be empty'),
});
export type SaveFcmTokenDto = z.infer<typeof SaveFcmTokenSchema>;
