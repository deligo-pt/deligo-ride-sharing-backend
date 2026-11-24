import { NotificationType, Prisma } from '@prisma/client';
import admin from '../../utils/firebase';
import prisma from '../../config/db';
import { sendBulkGateSms } from '../../utils/bulkgate';
import { Resend } from 'resend';
import type { RideStatusUpdatedPayload } from '../../sockets/socket.types';
import type { BroadcastNotificationInput, ListNotificationsQuery } from './notification.validation';
import type {
  BulkNotificationPayload,
  BulkResult,
  DispatchOptions,
  IoServer,
  NotificationChannel,
} from './notification.interface';
import {
  BROADCAST_ROLES,
  BULK_DB_CHUNK,
  DEFAULT_CHANNELS,
  FCM_BATCH_SIZE,
} from './notification.constant';
import { config } from '../../config';
import { NotFoundError } from '../../utils/errors';

let _io: IoServer | null = null;

const getIo = (): IoServer | null => {
  return _io;
};

const userRoom = (userId: string): string => `user_${userId}`;

const rideRoom = (rideId: string): string => `ride_${rideId}`;

export const logNotificationFailure =
  (context: string) =>
  (err: unknown): void => {
    console.error(`[NOTIFICATION] ${context} failed:`, err);
  };

const serializePushData = (data?: Record<string, unknown>): Record<string, string> | undefined => {
  if (!data) return undefined;
  const entries = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(
      ([k, v]) =>
        [k, typeof v === 'object' ? JSON.stringify(v) : String(v as string | number | boolean)] as [
          string,
          string,
        ],
    );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const persistInApp = async (
  opts: DispatchOptions,
): Promise<ReturnType<typeof prisma.notification.create>> => {
  return prisma.notification.create({
    data: {
      userId: opts.userId,
      title: opts.title,
      body: opts.message,
      type: opts.type,
      data: opts.data
        ? (JSON.parse(JSON.stringify(opts.data)) as Prisma.InputJsonValue)
        : undefined,
      isRead: false,
    },
  });
};

const emitNotification = (
  userId: string,
  id: string,
  payload: {
    title: string;
    message: string;
    type: NotificationType;
    data?: Record<string, unknown>;
  },
): void => {
  _io?.to(userRoom(userId)).emit('notification', {
    id,
    title: payload.title,
    message: payload.message,
    type: payload.type,
    data: payload.data ?? null,
    timestamp: new Date().toISOString(),
  });
};

const pushOverWebSocket = (opts: DispatchOptions, record: { id: string } | null): void => {
  if (!_io) {
    console.warn('[NOTIFICATION] WebSocket channel requested but io is not initialized yet.');
    return;
  }

  emitNotification(opts.userId, record?.id ?? '', opts);
  console.info(`[NOTIFICATION] WebSocket → user room "${userRoom(opts.userId)}" | ${opts.title}`);
};

const isInvalidTokenError = (err: unknown): boolean => {
  const { code = '', message = '' } = (err ?? {}) as { code?: string; message?: string };
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    (code === 'messaging/invalid-argument' && /registration token/i.test(message))
  );
};

const sendPush = async (opts: DispatchOptions): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { id: true, fcmToken: true },
  });

  if (!user?.fcmToken) {
    console.warn(`[PUSH] No FCM token for userId=${opts.userId} — skipping push notification.`);
    return;
  }

  const token = user.fcmToken;

  try {
    const messageId = await admin.messaging().send({
      token,
      notification: { title: opts.title, body: opts.message },
      data: serializePushData(opts.data),
    });

    console.info(`[PUSH] ✅ Sent | messageId=${messageId} | userId=${opts.userId} | ${opts.title}`);
  } catch (err: unknown) {
    if (isInvalidTokenError(err)) {
      console.warn(`[PUSH] Token expired/invalid for userId=${opts.userId} — clearing from DB.`);

      await prisma.user.updateMany({
        where: { id: opts.userId, fcmToken: token },
        data: { fcmToken: null },
      });
    } else {
      console.error(`[PUSH] Failed to send to userId=${opts.userId}:`, err);
    }
  }
};

const sendSMS = async (phone: string, message: string): Promise<void> => {
  await sendBulkGateSms(phone, message);
};

const sendEmail = async (to: string, subject: string, html: string): Promise<void> => {
  const apiKey = config.resend.apiKey;
  const fromAddr = config.email.fromAddress;

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
};

const pushToUsers = async (
  userIds: string[],
  payload: BulkNotificationPayload,
  result: BulkResult,
): Promise<void> => {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, fcmToken: { not: null } },
    select: { fcmToken: true },
  });
  const tokens = [...new Set(users.map((u) => u.fcmToken).filter((t): t is string => !!t))];
  if (tokens.length === 0) return;

  const deadTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
    const batch = tokens.slice(i, i + FCM_BATCH_SIZE);
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: batch,
        notification: { title: payload.title, body: payload.message },
        data: serializePushData(payload.data),
      });

      result.push.sent += response.successCount;
      result.push.failed += response.failureCount;
      response.responses.forEach((r, idx) => {
        if (!r.success && isInvalidTokenError(r.error)) deadTokens.push(batch[idx]);
      });
    } catch (err) {
      result.push.failed += batch.length;
      console.error(`[PUSH] Multicast batch failed (${batch.length} tokens):`, err);
    }
  }

  if (deadTokens.length > 0) {
    const cleared = await prisma.user.updateMany({
      where: { fcmToken: { in: deadTokens } },
      data: { fcmToken: null },
    });
    result.push.tokensCleared += cleared.count;
  }
};

const sendToUsers = async (
  userIds: string[],
  payload: BulkNotificationPayload,
  channels: NotificationChannel[] = DEFAULT_CHANNELS,
): Promise<BulkResult> => {
  const unique = [...new Set(userIds)];
  const result: BulkResult = {
    recipients: unique.length,
    inApp: 0,
    push: { sent: 0, failed: 0, tokensCleared: 0 },
  };

  const wantsSocket = channels.includes('WEBSOCKET');
  if (wantsSocket && !_io) {
    console.warn(
      '[NOTIFICATION] WebSocket channel requested but io is not initialized in this process.',
    );
  }

  for (let i = 0; i < unique.length; i += BULK_DB_CHUNK) {
    const chunk = unique.slice(i, i + BULK_DB_CHUNK);
    const ids = new Map<string, string>();

    if (channels.includes('IN_APP')) {
      try {
        const rows = await prisma.notification.createManyAndReturn({
          data: chunk.map((userId) => ({
            userId,
            title: payload.title,
            body: payload.message,
            type: payload.type,
            data: payload.data
              ? (JSON.parse(JSON.stringify(payload.data)) as Prisma.InputJsonValue)
              : undefined,
            isRead: false,
          })),
          select: { id: true, userId: true },
        });
        rows.forEach((r) => ids.set(r.userId, r.id));
        result.inApp += rows.length;
      } catch (err) {
        console.error(`[NOTIFICATION] Bulk IN_APP insert failed (${chunk.length} users):`, err);
      }
    }

    if (wantsSocket && _io) {
      try {
        for (const userId of chunk) emitNotification(userId, ids.get(userId) ?? '', payload);
      } catch (err) {
        console.error('[NOTIFICATION] Bulk WebSocket emit failed:', err);
      }
    }

    if (channels.includes('PUSH')) {
      try {
        await pushToUsers(chunk, payload, result);
      } catch (err) {
        console.error('[NOTIFICATION] Bulk push failed:', err);
      }
    }
  }

  return result;
};

const setIo = (io: IoServer): void => {
  _io = io;
  console.info('✅ NotificationService: Socket.io server registered');
};

const dispatch = async (
  opts: DispatchOptions,
  channelsArg?: NotificationChannel[],
): Promise<void> => {
  const channels = channelsArg ?? opts.channels ?? DEFAULT_CHANNELS;
  const fail = (channel: string, err: unknown): void =>
    console.error(
      `[NOTIFICATION] ${channel} delivery failed | userId=${opts.userId} | ${opts.title}:`,
      err,
    );

  let record: { id: string } | null = null;

  if (channels.includes('IN_APP')) {
    try {
      record = await persistInApp(opts);
      console.info(
        `[NOTIFICATION] IN_APP persisted | id=${record.id} userId=${opts.userId} type=${opts.type}`,
      );
    } catch (err) {
      fail('IN_APP', err);
    }
  }

  if (channels.includes('WEBSOCKET')) {
    try {
      pushOverWebSocket(opts, record);
    } catch (err) {
      fail('WEBSOCKET', err);
    }
  }

  if (channels.includes('PUSH')) {
    try {
      await sendPush(opts);
    } catch (err) {
      fail('PUSH', err);
    }
  }

  if (channels.includes('SMS')) {
    try {
      const userForSms = await prisma.user.findUnique({
        where: { id: opts.userId },
        select: { phone: true },
      });
      if (userForSms?.phone) {
        await sendSMS(userForSms.phone, `${opts.title}: ${opts.message}`);
      } else {
        console.warn(`[SMS] No phone number for userId=${opts.userId} — skipping.`);
      }
    } catch (err) {
      fail('SMS', err);
    }
  }

  if (channels.includes('EMAIL')) {
    try {
      const userForEmail = await prisma.user.findUnique({
        where: { id: opts.userId },
        select: { email: true },
      });
      if (userForEmail?.email) {
        const html = opts.emailHtml ?? `<p>${escapeHtml(opts.message)}</p>`;
        await sendEmail(userForEmail.email, opts.title, html);
      } else {
        console.warn(`[EMAIL] No email for userId=${opts.userId} — skipping.`);
      }
    } catch (err) {
      fail('EMAIL', err);
    }
  }
};

const emitRideStatus = (payload: Omit<RideStatusUpdatedPayload, 'timestamp'>): void => {
  try {
    _io?.to(rideRoom(payload.rideId)).emit('ride_status_updated', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(
      `[NOTIFICATION] ride_status_updated emit failed | rideId=${payload.rideId}:`,
      err,
    );
  }
};

const getInbox = async (userId: string, query: ListNotificationsQuery) => {
  const { page, limit, unread } = query;
  const skip = (page - 1) * limit;

  const where = {
    userId,

    ...(unread === 'true' && { isRead: false }),
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
};

const markAsRead = async (userId: string, notificationId: string) => {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!notification) {
    throw new NotFoundError('Notification');
  }

  if (notification.isRead) {
    return notification;
  }

  return prisma.notification.update({
    where: { id: notification.id },
    data: { isRead: true, readAt: new Date() },
  });
};

const markAllAsRead = async (userId: string) => {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { updatedCount: result.count };
};

const broadcastNotification = async (payload: BroadcastNotificationInput) => {
  const where: Prisma.UserWhereInput = {
    isDeleted: false,
    status: 'ACTIVE',
    role: payload.targetRole === 'ALL' ? { in: BROADCAST_ROLES } : payload.targetRole,
  };

  const recipientCount = await prisma.user.count({ where });

  void deliverBroadcast(where, payload).catch(logNotificationFailure('broadcast'));

  return { success: true, targetRole: payload.targetRole, recipientCount, status: 'PROCESSING' };
};

const deliverBroadcast = async (
  where: Prisma.UserWhereInput,
  payload: BroadcastNotificationInput,
): Promise<void> => {
  let cursor: string | undefined;
  let recipients = 0;
  let inApp = 0;
  let pushSent = 0;
  let pushFailed = 0;

  for (;;) {
    const page = await prisma.user.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BULK_DB_CHUNK,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    if (page.length === 0) break;

    const result = await sendToUsers(
      page.map((u) => u.id),
      { type: 'SYSTEM', title: payload.title, message: payload.message },
    );
    recipients += result.recipients;
    inApp += result.inApp;
    pushSent += result.push.sent;
    pushFailed += result.push.failed;

    cursor = page[page.length - 1].id;
    if (page.length < BULK_DB_CHUNK) break;
  }

  console.info(
    `[NOTIFICATION] Broadcast done | role=${payload.targetRole} recipients=${recipients} inApp=${inApp} push=${pushSent} ok/${pushFailed} failed`,
  );
};

export const NotificationService = {
  setIo,
  dispatch,

  sendToUsers,
  emitRideStatus,

  sendSMS,
  sendEmail,

  getIo,
  getInbox,
  markAsRead,
  markAllAsRead,
  broadcastNotification,
};

export { NotificationType };
