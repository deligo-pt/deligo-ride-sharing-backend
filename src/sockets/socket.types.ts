import { Socket } from 'socket.io';

// ─────────────────────────────────────────────────────────────────────────────
// Socket Authentication Context
//
// Attached to every socket after the handshake middleware runs.
// Mirrors the HTTP req.user shape so downstream handlers stay consistent.
// ─────────────────────────────────────────────────────────────────────────────

export interface SocketUser {
  id: string;
  role: string; // 'DRIVER' | 'CUSTOMER' | 'ADMIN'
  email?: string;
  sessionId: string;
}

/**
 * Extend Socket.data so TypeScript knows the shape of socket.data.user
 * without casting everywhere.
 */
export interface SocketData {
  user: SocketUser;
}

/** Convenience alias used throughout the sockets layer */
export type AuthenticatedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

// ─────────────────────────────────────────────────────────────────────────────
// Event Contracts
//
// Typed maps keep every emit/on call checked at compile time.
// ─────────────────────────────────────────────────────────────────────────────

/** Events the CLIENT sends to the SERVER */
export interface ClientToServerEvents {
  /** Join a private ride room */
  join_ride: (payload: { rideId: string }) => void;

  /** Join the user's personal notification room (call once on connect) */
  notification_subscribe: () => void;

  /** Driver broadcasts live GPS position */
  driver_location_update: (payload: LocationPayload) => void;

  /** Either party sends a chat message */
  message: (payload: { message: string }) => void;
}

/** Events the SERVER emits to CLIENTS */
export interface ServerToClientEvents {
  /** Forwarded driver location — received by the customer */
  live_location: (payload: LiveLocationPayload) => void;

  /** New chat message broadcast to the room */
  new_chat_message: (payload: ChatMessagePayload) => void;

  /** Acknowledgement after joining a room */
  room_joined: (payload: { room: string }) => void;

  /** Push a notification to a user's personal room */
  notification: (payload: NotificationPayload) => void;

  /** SOS alert broadcast to the admin_security_desk room */
  sos_alert: (payload: SosAlertPayload) => void;

  /** A ride changed state; sent to the ride_<rideId> room (customer + driver after join_ride) */
  ride_status_updated: (payload: RideStatusUpdatedPayload) => void;

  /** Error feedback to the originating client */
  error: (payload: { message: string }) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LocationPayload {
  lat: number;
  lng: number;
  heading?: number; // degrees 0-359
  speed?: number;   // km/h
}

export interface LiveLocationPayload extends LocationPayload {
  driverId: string;
  timestamp: string; // ISO-8601
}

export interface ChatMessagePayload {
  senderId: string;
  senderRole: string;
  message: string;
  timestamp: string; // ISO-8601
}

export interface NotificationPayload {
  id: string;
  title: string;
  message: string;
  type: string;
  data: Record<string, unknown> | null;
  timestamp: string; // ISO-8601
}

export interface RideStatusUpdatedPayload {
  rideId: string;
  status: string;
  updatedBy: 'DRIVER' | 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  reason?: string | null;
  timestamp: string; // ISO-8601
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
  createdAt: string; // ISO-8601
}
