import type { NotificationType, Ride, RideStatus } from '@prisma/client';

export interface RideChange {
  rideId: string;
  status: RideStatus;
  updatedBy: 'DRIVER' | 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
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

export interface RideViewer {
  id: string;
  role: string;
}
