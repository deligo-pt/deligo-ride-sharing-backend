import type { RideStatus } from '@prisma/client';

/** Radius (km) around the pickup point in which available drivers are searched. */
export const NEARBY_DRIVER_RADIUS_KM = 5;

/** Customer-facing copy for each driver-driven ride status change. */
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

// ─────────────────────────────────────────────────────────────────────────────
// Ride State Machine
//
// The only legal status transitions. Every mutation below goes through
// assertRideTransition() AND a conditional write (`updateMany` whose WHERE
// pins the status we validated), so a concurrent request can never push a ride
// through an illegal or duplicated transition.
//
//   SCHEDULED ─▶ REQUESTED ─▶ ACCEPTED ─▶ DRIVER_ARRIVED ─▶ IN_PROGRESS ─▶ COMPLETED
//        │            │           │              │               │
//        └────────────┴───────────┴──────────────┴───────────────┴──▶ CANCELLED
//                                 └──────────────┴───────────────┴──▶ EMERGENCY ─▶ COMPLETED | CANCELLED
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Map each allowed status transition to its timestamp field.
 */
export const STATUS_TIMESTAMP_MAP = {
  DRIVER_ARRIVED: 'arrivedAt',
  IN_PROGRESS: 'startedAt',
  COMPLETED: 'completedAt',
} as const;

// ── Trip sharing ──────────────────────────────────────────────────────────────
export const TRACKING_TOKEN_TTL_SECONDS = 86_400; // 24 hours
export const TRACKING_BASE_URL = 'https://deligo.com/track';
