import { NotificationType, Prisma } from '@prisma/client';
import type { Server as SocketIoServer } from 'socket.io';
import admin from '../../utils/firebase';
import prisma from '../../config/db';
import { sendBulkGateSms } from '../../utils/bulkgate';
import { Resend } from 'resend';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../sockets/socket.types';
import type {
  DispatchOptions,
  ListNotificationsQuery,
  NotificationChannel,
} from './notification.validation';

// ─────────────────────────────────────────────────────────────────────────────
// PRD 3.12: Notification Engine
//
// Single source of truth for dispatching notifications across multiple
// channels. Supported:
//   • IN_APP    → persisted in the `notifications` table (Prisma)
//   • WEBSOCKET → pushed to the user's personal Socket.io room
//   • PUSH      → Firebase FCM via firebase-admin SDK
//   • SMS       → BulkGate transactional API (src/utils/bulkgate.ts)
//   • EMAIL     → [MOCK] placeholder for SendGrid / SES
//
// Usage:
//   import { NotificationEngine } from '...notifications.service';
//   await NotificationEngine.dispatch({ userId, title, message, type });
// ─────────────────────────────────────────────────────────────────────────────

// ── Socket.io server reference ────────────────────────────────────────────────
// Injected once at startup from server.ts via NotificationEngine.setIo().
// Kept as a module-level singleton so ride/other services can call dispatch()
// without carrying the io instance around.
type IoServer = SocketIoServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

let _io: IoServer | null = null;

/**
 * Returns the Socket.io server instance, or null if not yet initialised.
 * Use this to emit to arbitrary rooms from outside the NotificationEngine.
 */
export function getIo(): IoServer | null {
  return _io;
}

const userRoom = (userId: string) => `user_${userId}`;

// ─────────────────────────────────────────────────────────────────────────────
// Private channel helpers
// ─────────────────────────────────────────────────────────────────────────────

async function persistInApp(
  opts: DispatchOptions,
): Promise<ReturnType<typeof prisma.notification.create>> {
  return prisma.notification.create({
    data: {
      userId:  opts.userId,
      title:   opts.title,
      body:    opts.message,
      type:    opts.type,
      // Prisma's InputJsonValue doesn't accept plain Record — cast via JSON
      data:    opts.data ? (JSON.parse(JSON.stringify(opts.data)) as Prisma.InputJsonValue) : undefined,
      isRead:  false,
    },
  });
}

function pushOverWebSocket(
  opts: DispatchOptions,
  record: { id: string } | null,
): void {
  if (!_io) {
    console.warn('[NOTIFICATION] WebSocket channel requested but io is not initialized yet.');
    return;
  }

  // Each authenticated user automatically joins a personal room named user_<userId>
  // (see socket.handlers.ts — the join happens on the `notification_subscribe` event
  // or can be auto-joined on connection in a future iteration).
  _io.to(userRoom(opts.userId)).emit('notification', {
    id:        record?.id ?? '',
    title:     opts.title,
    message:   opts.message,
    type:      opts.type,
    data:      opts.data ?? null,
    timestamp: new Date().toISOString(),
  });

  console.info(`[NOTIFICATION] WebSocket → user room "${userRoom(opts.userId)}" | ${opts.title}`);
}

/**
 * Send a real Firebase Cloud Messaging push notification.
 *
 * Flow:
 *  1. Fetch the user's fcmToken from the database.
 *  2. If no token is stored, warn and bail — don't crash the caller.
 *  3. Send via firebase-admin messaging().send().
 *  4. Handle expired/invalid tokens gracefully (log only).
 */
async function sendPush(opts: DispatchOptions): Promise<void> {
  // 1. Lookup user's FCM token
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { id: true, fcmToken: true },
  });

  if (!user?.fcmToken) {
    console.warn(
      `[PUSH] No FCM token for userId=${opts.userId} — skipping push notification.`,
    );
    return;
  }

  // 2. Send via Firebase Admin SDK
  try {
    const messageId = await admin.messaging().send({
      token: user.fcmToken,
      notification: {
        title: opts.title,
        body:  opts.message,
      },
      // Optional data payload for the mobile app to act on
      data: opts.data
        ? Object.fromEntries(
            Object.entries(opts.data).map(([k, v]) => [k, String(v)]),
          )
        : undefined,
    });

    console.info(`[PUSH] ✅ Sent | messageId=${messageId} | userId=${opts.userId} | ${opts.title}`);
  } catch (err: unknown) {
    // Expired or unregistered tokens are expected — log and move on
    const code = (err as { code?: string }).code ?? '';
    if (code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token') {
      console.warn(`[PUSH] Token expired/invalid for userId=${opts.userId} — clearing from DB.`);
      // Proactively clear stale token so we don't keep trying
      await prisma.user.update({
        where: { id: opts.userId },
        data:  { fcmToken: null },
      });
    } else {
      console.error(`[PUSH] Failed to send to userId=${opts.userId}:`, err);
    }
  }
}

/**
 * Send a transactional SMS via BulkGate.
 *
 * Delegates to `sendBulkGateSms` which gracefully degrades to a console
 * log when BULKGATE_APPLICATION_ID / BULKGATE_APPLICATION_TOKEN are absent.
 *
 * @param phone   Recipient phone in any international format (e.g. "+447000000000").
 * @param message SMS body text.
 */
async function sendSMS(phone: string, message: string): Promise<void> {
  await sendBulkGateSms(phone, message);
}

/**
 * Send a transactional email via Resend.
 * Falls back to console.log if RESEND_API_KEY is not configured.
 */
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.EMAIL_FROM_ADDRESS ?? 'noreply@deligo.app';

  if (!apiKey) {
    console.log(`[EMAIL FALLBACK] → ${to} | ${subject}`);
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from: fromAddr, to, subject, html });
    if (error) throw new Error(error.message);
    console.info(`[EMAIL] ✅ Sent | id=${data?.id} | to=${to}`);
  } catch (err) {
    console.error(`[EMAIL] ❌ Failed to send to ${to}:`, err);
  }
}

/**
 * Public helpers exposed for use in receipt and other direct dispatch
 * scenarios where callers already have the phone/email value.
 */
export { sendSMS, sendEmail };

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export const NotificationEngine = {
  /**
   * Inject the Socket.io server instance.
   * Call this once from server.ts immediately after initSocketServer().
   */
  setIo(io: IoServer): void {
    _io = io;
    console.info('✅ NotificationEngine: Socket.io server registered');
  },

  /**
   * Dispatch a notification across the requested channels.
   *
   * Default channels: ['IN_APP', 'WEBSOCKET']
   *
   * @example
   * await NotificationEngine.dispatch({
   *   userId:   customerUserId,
   *   title:    'Driver Assigned',
   *   message:  'Your driver is on the way!',
   *   type:     NotificationType.RIDE_ACCEPTED,
   *   channels: ['IN_APP', 'WEBSOCKET'],
   *   data:     { rideId, driverName },
   * });
   */
  async dispatch(
    opts: DispatchOptions,
    channels: NotificationChannel[] = ['IN_APP', 'WEBSOCKET'],
  ): Promise<void> {
    // 1. Persist to DB (IN_APP) first so the record ID is available for WS payload
    let record: { id: string } | null = null;

    if (channels.includes('IN_APP')) {
      record = await persistInApp(opts);
      console.info(`[NOTIFICATION] IN_APP persisted | id=${record.id} userId=${opts.userId} type=${opts.type}`);
    }

    // 2. WebSocket — push to user's personal room
    if (channels.includes('WEBSOCKET')) {
      pushOverWebSocket(opts, record);
    }

    // 3. Push notification
    if (channels.includes('PUSH'))  await sendPush(opts);

    // 4. SMS — look up user phone and dispatch via Twilio
    if (channels.includes('SMS')) {
      const userForSms = await prisma.user.findUnique({
        where: { id: opts.userId },
        select: { phone: true },
      });
      if (userForSms?.phone) {
        void sendSMS(userForSms.phone, `${opts.title}: ${opts.message}`);
      } else {
        console.warn(`[SMS] No phone number for userId=${opts.userId} — skipping.`);
      }
    }

    // 5. EMAIL — look up user email and dispatch via Resend
    if (channels.includes('EMAIL')) {
      const userForEmail = await prisma.user.findUnique({
        where: { id: opts.userId },
        select: { email: true },
      });
      if (userForEmail?.email) {
        const html = opts.emailHtml ?? `<p>${opts.message}</p>`;
        void sendEmail(userForEmail.email, opts.title, html);
      } else {
        console.warn(`[EMAIL] No email for userId=${opts.userId} — skipping.`);
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Inbox Queries  (used by the controller)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return paginated notifications for a user, newest first.
 * Optionally filter to unread only.
 */
export async function getInbox(userId: string, query: ListNotificationsQuery) {
  const { page, limit, unread } = query;
  const skip = (page - 1) * limit;

  const where = {
    userId,
    ...(unread === 'true'  && { isRead: false }),
    ...(unread === 'false' && { isRead: true }),
  };

  const [notifications, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    unreadCount,
  };
}

/**
 * Mark a single notification as read.
 * Throws if it doesn't exist or doesn't belong to the requesting user.
 */
export async function markAsRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, userId: true, isRead: true },
  });

  if (!notification) {
    throw new Error('NOTIFICATION_NOT_FOUND');
  }

  if (notification.userId !== userId) {
    throw new Error('NOTIFICATION_FORBIDDEN');
  }

  if (notification.isRead) {
    // Idempotent — already read, return as-is
    return prisma.notification.findUnique({ where: { id: notificationId } });
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data:  { isRead: true, readAt: new Date() },
  });
}

/**
 * Mark ALL unread notifications as read for the logged-in user.
 */
export async function markAllAsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data:  { isRead: true, readAt: new Date() },
  });
  return { updatedCount: result.count };
}

// ─────────────────────────────────────────────────────────────────────────────
// FCM Token Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save (or replace) the FCM push token for a user.
 * Called by the mobile app on login or when the OS issues a new token.
 */
export async function saveFcmToken(
  userId: string,
  fcmToken: string,
): Promise<{ message: string }> {
  await prisma.user.update({
    where: { id: userId },
    data:  { fcmToken },
  });

  console.info(`[FCM] Token saved for userId=${userId}`);
  return { message: 'FCM token saved successfully.' };
}

// Re-export the type so callers don't need two imports
export { NotificationType };
