import { Socket } from 'socket.io';

export interface SocketUser {
  id: string;
  role: string;
  email?: string;
  sessionId: string;
}

export interface SocketData {
  user: SocketUser;
}

export type AuthenticatedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface ClientToServerEvents {
  join_ride: (payload: { rideId: string }) => void;

  notification_subscribe: () => void;

  driver_location_update: (payload: LocationPayload) => void;

  message: (payload: { message: string }) => void;
}

export interface ServerToClientEvents {
  live_location: (payload: LiveLocationPayload) => void;

  new_chat_message: (payload: ChatMessagePayload) => void;

  room_joined: (payload: { room: string }) => void;

  notification: (payload: NotificationPayload) => void;

  sos_alert: (payload: SosAlertPayload) => void;

  ride_status_updated: (payload: RideStatusUpdatedPayload) => void;

  error: (payload: { message: string }) => void;
}

export interface LocationPayload {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}

export interface LiveLocationPayload extends LocationPayload {
  driverId: string;
  timestamp: string;
}

export interface ChatMessagePayload {
  senderId: string;
  senderRole: string;
  message: string;
  timestamp: string;
}

export interface NotificationPayload {
  id: string;
  title: string;
  message: string;
  type: string;
  data: Record<string, unknown> | null;
  timestamp: string;
}

export interface RideStatusUpdatedPayload {
  rideId: string;
  status: string;
  updatedBy: 'DRIVER' | 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  reason?: string | null;
  timestamp: string;
}

export interface SosAlertPayload {
  alertId: string;
  initiatorId: string;
  initiatorName: string;
  initiatorRole: 'CUSTOMER' | 'DRIVER';
  rideId: string | null;
  lat: number;
  lng: number;
  mapsLink: string;
  status: 'ACTIVE';
  createdAt: string;
}
