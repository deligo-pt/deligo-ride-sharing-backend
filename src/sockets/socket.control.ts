import { getIo } from '../modules/notification/notification.service';

// ─────────────────────────────────────────────────────────────────────────────
// Socket lifecycle control
//
// Every authenticated socket joins two private rooms (see socket.handlers.ts):
//   user_<userId>        — all of a user's devices
//   session_<sessionId>  — the single login session the socket authenticated with
//
// Call these when a session/account is revoked so already-connected sockets
// can't keep receiving ride data after logout, password change or a ban.
//
// Note: io.in(...).disconnectSockets() only reaches sockets on THIS process.
// Running several API instances needs the Socket.IO Redis adapter.
// ─────────────────────────────────────────────────────────────────────────────

export const userRoom = (userId: string): string => `user_${userId}`;
export const sessionRoom = (sessionId: string): string => `session_${sessionId}`;

/** Force-close every socket authenticated with this session. */
export function disconnectSessionSockets(sessionId: string): void {
  getIo()?.in(sessionRoom(sessionId)).disconnectSockets(true);
}

/** Force-close every socket (all devices) belonging to this user. */
export function disconnectUserSockets(userId: string): void {
  getIo()?.in(userRoom(userId)).disconnectSockets(true);
}
