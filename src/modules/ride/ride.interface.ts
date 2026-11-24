import type { NotificationType, Ride, RideStatus } from '@prisma/client';

/** A ride state change to announce to the ride room and to the counterparty. */
export interface RideChange {
  rideId: string;
  status: RideStatus;
  updatedBy: 'DRIVER' | 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  /** Which participant is told: the other side of whoever made the change. */
  notify: 'CUSTOMER' | 'DRIVER';
  type: NotificationType;
  title: string;
  message: string;
  reason?: string | null;
  data?: Record<string, unknown>;
}

export interface RequestRideResult {
  ride: Ride;
  dispatchedDriverIds: string[];
  scheduled: boolean;
}

/** The authenticated user asking for ride data (drives the role-scoped queries). */
export interface RideViewer {
  id: string;
  role: string;
}
