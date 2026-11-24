import type { UserRole } from '@prisma/client';

/** Every channel NotificationService.dispatch() can deliver through. */
export const NOTIFICATION_CHANNELS = ['IN_APP', 'WEBSOCKET', 'PUSH', 'SMS', 'EMAIL'] as const;

/** Channels used when the caller doesn't ask for specific ones. */
export const DEFAULT_CHANNELS: (typeof NOTIFICATION_CHANNELS)[number][] = [
  'IN_APP',
  'WEBSOCKET',
  'PUSH',
];

export const BULK_DB_CHUNK = 1000; // rows per createManyAndReturn / users per broadcast page
export const FCM_BATCH_SIZE = 500; // sendEachForMulticast hard limit

/** Roles reachable by an `ALL` broadcast (admins are deliberately excluded). */
export const BROADCAST_ROLES: UserRole[] = ['CUSTOMER', 'DRIVER', 'FLEET_MANAGER'];
