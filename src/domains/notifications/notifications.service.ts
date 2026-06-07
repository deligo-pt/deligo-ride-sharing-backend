import { NotificationType } from '@prisma/client';
import type { Server as SocketIoServer } from 'socket.io';
import prisma from '../../config/db';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../sockets/socket.types';
import type {
  DispatchOptions,
  ListNotificationsQuery,
  NotificationChannel,
} from './notifications.validation';

// ─────────────────────────────────────────────────────────────────────────────
// PRD 3.12: Notification Engine
//
// Single source of truth for dispatching notifications across multiple
// channels. Currently supported:
//   • IN_APP    → persisted in the `notifications` table (Prisma)
//   • WEBSOCKET → pushed to the user's personal Socket.io room
//   • PUSH      → [MOCK] placeholder for Firebase FCM
//   • SMS       → [MOCK] placeholder for Twilio SMS
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

// ── Per-user room name (matches the pattern used in socket.handlers.ts) ──────
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
      data:    opts.data ? JSON.parse(JSON.stringify(opts.data)) : undefined,
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

/** [MOCK] Will integrate Firebase FCM in production */
function sendPush(opts: DispatchOptions): void {
  console.log(`[MOCK PUSH]  → userId=${opts.userId} | ${opts.title}: ${opts.message}`);
}

/** [MOCK] Will integrate Twilio SMS in production */
function sendSMS(opts: DispatchOptions): void {
  console.log(`[MOCK SMS]   → userId=${opts.userId} | ${opts.title}: ${opts.message}`);
}

/** [MOCK] Will integrate SendGrid / AWS SES in production */
function sendEmail(opts: DispatchOptions): void {
  console.log(`[MOCK EMAIL] → userId=${opts.userId} | ${opts.title}: ${opts.message}`);
}

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

    // 3. Other channels — mocked for now
    if (channels.includes('PUSH'))  sendPush(opts);
    if (channels.includes('SMS'))   sendSMS(opts);
    if (channels.includes('EMAIL')) sendEmail(opts);
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

// Re-export the type so callers don't need two imports
export { NotificationType };
