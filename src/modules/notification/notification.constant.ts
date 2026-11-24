import type { UserRole } from '@prisma/client';

export const NOTIFICATION_CHANNELS = ['IN_APP', 'WEBSOCKET', 'PUSH', 'SMS', 'EMAIL'] as const;

export const DEFAULT_CHANNELS: (typeof NOTIFICATION_CHANNELS)[number][] = [
  'IN_APP',
  'WEBSOCKET',
  'PUSH',
];

export const BULK_DB_CHUNK = 1000;
export const FCM_BATCH_SIZE = 500;

export const BROADCAST_ROLES: UserRole[] = ['CUSTOMER', 'DRIVER', 'FLEET_MANAGER'];
