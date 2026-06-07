import type { Server as HttpServer } from 'http';
import { Server as SocketIoServer } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  AuthenticatedSocket,
} from './socket.types';
import { registerSocketHandlers } from './socket.handlers';

// ─────────────────────────────────────────────────────────────────────────────
// Socket.io Bootstrap
//
// Attaches a Socket.io server to the Node HTTP server, configures:
//   • CORS (open for dev; tighten to env.ALLOWED_ORIGINS in production)
//   • Handshake authentication middleware (mirrors mockAuth for REST)
//   • Registers all ride-telemetry and chat event handlers
// ─────────────────────────────────────────────────────────────────────────────

export function initSocketServer(
  httpServer: HttpServer,
): SocketIoServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> {
  const io = new SocketIoServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: {
      origin: '*',          // Dev-only; restrict in production
      methods: ['GET', 'POST'],
    },
    // Allow both polling and WebSocket transports
    transports: ['polling', 'websocket'],
  });

  // ── Auth Middleware ─────────────────────────────────────────────────────────
  // Mirrors the mockAuth REST middleware: reads x-mock-user-id / x-mock-role
  // from either handshake.headers or handshake.auth so both Postman WS clients
  // (which use headers) and browser SDK clients (which use auth payload) work.
  io.use((socket: AuthenticatedSocket, next) => {
    const headers = socket.handshake.headers;
    const auth    = socket.handshake.auth as Record<string, string>;

    const userId = (headers['x-mock-user-id'] as string) ?? auth['x-mock-user-id'];
    const role   = (headers['x-mock-role']    as string) ?? auth['x-mock-role'];

    if (!userId || !role) {
      next(
        new Error(
          'Socket authentication failed. Provide x-mock-user-id and x-mock-role in headers or auth payload.',
        ),
      );
      return;
    }

    socket.data.user = { id: userId, role };
    next();
  });

  // ── Register all event handlers ─────────────────────────────────────────────
  registerSocketHandlers(io);

  console.info('✅ Socket.io server initialized');
  return io;
}
