import type { RideStatus } from '@prisma/client';

export const NEARBY_DRIVER_RADIUS_KM = 5;

export const RIDE_STATUS_NOTICES: Partial<Record<RideStatus, { title: string; message: string }>> =
  {
    DRIVER_ARRIVED: {
      title: 'Your driver has arrived',
      message: 'Your driver is waiting at the pickup location.',
    },
    IN_PROGRESS: { title: 'Trip started', message: 'Your trip is now in progress.' },
    COMPLETED: {
      title: 'Trip completed',
      message: 'You have reached your destination. Thanks for riding with Deligo!',
    },
  };

export const RIDE_TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  SCHEDULED: ['REQUESTED', 'CANCELLED'],
  REQUESTED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['DRIVER_ARRIVED', 'CANCELLED', 'EMERGENCY'],
  DRIVER_ARRIVED: ['IN_PROGRESS', 'CANCELLED', 'EMERGENCY'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'EMERGENCY'],
  EMERGENCY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const STATUS_TIMESTAMP_MAP = {
  DRIVER_ARRIVED: 'arrivedAt',
  IN_PROGRESS: 'startedAt',
  COMPLETED: 'completedAt',
} as const;

export const TRACKING_TOKEN_TTL_SECONDS = 86_400;
export const TRACKING_BASE_URL = 'https://deligo.com/track';
