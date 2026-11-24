import type { NotificationType } from '@prisma/client';
import type { Server as SocketIoServer } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../sockets/socket.types';
import type { NOTIFICATION_CHANNELS } from './notification.constant';

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Payload shared by every recipient of NotificationService.sendToUsers(). */
export interface BulkNotificationPayload {
  title: string;
  message: string;
  type: NotificationType;
  data?: Record<string, unknown>;
}

export interface DispatchOptions {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  channels?: NotificationChannel[];
  /** Optional structured metadata stored in the Notification.data JSON column */
  data?: Record<string, unknown>;
  /** Optional rich HTML body used when the EMAIL channel is requested */
  emailHtml?: string;
}

/** The typed Socket.IO server NotificationService emits through. */
export type IoServer = SocketIoServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface BulkResult {
  recipients: number;
  inApp: number;
  push: { sent: number; failed: number; tokensCleared: number };
}
