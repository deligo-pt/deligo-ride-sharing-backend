import type { Server } from 'socket.io';
import prisma from '../config/db';
import { sessionRoom, userRoom } from './socket.control';
import type {
  AuthenticatedSocket,
  ClientToServerEvents,
  LocationPayload,
  ServerToClientEvents,
  SocketData,
} from './socket.types';

// ─────────────────────────────────────────────────────────────────────────────
// Socket.io Event Handlers
//
// Called once per connection after the auth middleware has populated
// socket.data.user. All ride-specific events are scoped to a private room
// named  ride_<rideId>  so driver and customer communicate in isolation.
// ─────────────────────────────────────────────────────────────────────────────

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Build the private room name from a ride ID. */
const rideRoom = (rideId: string) => `ride_${rideId}`;

export function registerSocketHandlers(io: IoServer): void {
  io.on('connection', (socket: AuthenticatedSocket) => {
    const { id: userId, role, sessionId } = socket.data.user;
    console.info(`🔌 [SOCKET] Connected   | socketId=${socket.id} userId=${userId} role=${role}`);

    // ── Auto-join personal notification room ──────────────────────────────────
    // Every authenticated socket is automatically placed in user_<userId>.
    // The NotificationEngine uses this room to push real-time notifications.
    void socket.join(userRoom(userId));

    // Per-session room — lets logout / revocation disconnect just this login session.
    void socket.join(sessionRoom(sessionId));

    // Verified ADMINs receive SOS alerts on the security desk room. The role comes
    // from the verified JWT, so it can't be self-asserted by the client.
    if (role === 'ADMIN') {
      void socket.join('admin_security_desk');
    }

    // ── notification_subscribe ────────────────────────────────────────────────
    // Explicit subscription event — lets the client confirm the join and
    // learn the room name. Useful for debugging in Postman.
    socket.on('notification_subscribe', async () => {
      const room = `user_${userId}`;
      await socket.join(room);
      socket.emit('room_joined', { room });
      console.info(`[SOCKET] ${userId} subscribed to notification room "${room}"`);
    });

    // ── join_ride ─────────────────────────────────────────────────────────────
    // Accepts: { "rideId": "..." }  OR  a plain string "..."
    // Both the driver and customer emit this right after a ride is accepted.
    socket.on('join_ride', async (payload: unknown) => {
      // Normalise: accept { rideId } object OR bare string
      const rideId =
        typeof payload === 'string'
          ? payload
          : (payload as Record<string, unknown>)?.rideId as string | undefined;

      if (!rideId || typeof rideId !== 'string') {
        console.warn(`[SOCKET] join_ride rejected — invalid payload from ${socket.id}:`, payload);
        socket.emit('error', { message: 'join_ride requires { "rideId": "your-ride-id" }.' });
        return;
      }

      // Only the ride's own customer / assigned driver (or an admin) may join.
      try {
        const ride = await prisma.ride.findFirst({
          where: { id: rideId, isDeleted: false },
          select: {
            customerProfile: { select: { userId: true } },
            driverProfile: { select: { userId: true } },
          },
        });

        const isParticipant =
          ride?.customerProfile.userId === userId || ride?.driverProfile?.userId === userId;

        if (!ride || (!isParticipant && role !== 'ADMIN')) {
          // Same response for "missing" and "not yours" so ride IDs can't be probed.
          socket.emit('error', { message: 'Ride not found or you are not a participant.' });
          return;
        }
      } catch (err) {
        console.error('[SOCKET] Failed to verify ride membership:', err);
        socket.emit('error', { message: 'Server error joining ride room.' });
        return;
      }

      const room = rideRoom(rideId);

      //  socket.join() returns a Promise — MUST be awaited.
      try {
        await socket.join(room);
        console.info(`[SOCKET] ${userId} (${role}) joined room "${room}"`);
        console.info(`[SOCKET] ${socket.id} current rooms: ${[...socket.rooms].join(', ')}`);
        socket.emit('room_joined', { room });
      } catch (err) {
        console.error('[SOCKET] Failed to join room:', err);
        socket.emit('error', { message: 'Server error joining ride room.' });
      }
    });

    // ── driver_location_update ────────────────────────────────────────────────
    // Only the DRIVER may broadcast their GPS position.
    // Broadcasted to everyone else in every ride room the driver joined.
    socket.on('driver_location_update', (payload: LocationPayload) => {
      console.info(`[SOCKET] driver_location_update from ${userId} | rooms: ${[...socket.rooms].join(', ')}`);

      if (role !== 'DRIVER') {
        socket.emit('error', { message: 'Only drivers may emit driver_location_update.' });
        return;
      }

      if (typeof payload?.lat !== 'number' || typeof payload?.lng !== 'number') {
        socket.emit('error', { message: 'driver_location_update requires numeric lat and lng.' });
        return;
      }

      let broadcastCount = 0;
      socket.rooms.forEach((room) => {
        if (room.startsWith('ride_')) {
          // socket.to() = everyone in room EXCEPT the sender
          socket.to(room).emit('live_location', {
            driverId: userId,
            lat: payload.lat,
            lng: payload.lng,
            heading: payload.heading,
            speed: payload.speed,
            timestamp: new Date().toISOString(),
          });
          broadcastCount++;
        }
      });

      console.info(`[SOCKET] live_location broadcast to ${broadcastCount} room(s)`);
    });

    // ── message (in-trip chat) ────────────────────────────────────────────────
    // Accepts: { "message": "hello" }  OR  a plain string "hello"
    // Broadcasted to ALL sockets in the ride room (including sender).
    socket.on('message', (rawPayload: unknown) => {
      // Normalise: accept { message } object OR bare string
      const text =
        typeof rawPayload === 'string'
          ? rawPayload
          : (rawPayload as Record<string, unknown>)?.message as string | undefined;

      if (!text || typeof text !== 'string' || text.trim() === '') {
        socket.emit('error', { message: 'message payload must contain a non-empty string.' });
        return;
      }

      const chatPayload = {
        senderId: userId,
        senderRole: role,
        message: text.trim(),
        timestamp: new Date().toISOString(),
      };

      let broadcastCount = 0;
      socket.rooms.forEach((room) => {
        if (room.startsWith('ride_')) {
          // io.to() = ALL sockets in room (including sender)
          io.to(room).emit('new_chat_message', chatPayload);
          broadcastCount++;
          console.info(`[SOCKET] new_chat_message → room "${room}" | sender=${userId} (${role})`);
        }
      });

      if (broadcastCount === 0) {
        console.warn(`[SOCKET] message from ${userId} was NOT broadcast — socket is not in any ride_ room!`);
        socket.emit('error', {
          message: 'You are not in a ride room. Send join_ride first.',
        });
      }
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.info(`🔌 [SOCKET] Disconnected | socketId=${socket.id} userId=${userId} reason=${reason}`);
    });
  });
}
