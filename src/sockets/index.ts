import type { Server as HttpServer } from 'http';
import { Server as SocketIoServer } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  AuthenticatedSocket,
} from './socket.types';
import { registerSocketHandlers } from './socket.handlers';
import { assertSessionActive, verifyAccessToken } from '../middlewares/auth';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';

/** Pulls a bearer token from handshake.auth.token or the Authorization header. */
function extractHandshakeToken(socket: AuthenticatedSocket): string | undefined {
  const auth = socket.handshake.auth as { token?: unknown };
  const raw =
    (typeof auth?.token === 'string' ? auth.token : undefined) ??
    socket.handshake.headers.authorization;

  if (!raw) return undefined;
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
  return token.trim() || undefined;
}

/** Verifies the handshake JWT + session and populates socket.data.user. */
async function authenticateSocket(socket: AuthenticatedSocket): Promise<void> {
  const token = extractHandshakeToken(socket);
  if (!token) {
    throw new UnauthorizedError('No access token provided');
  }

  const payload = await verifyAccessToken(token);

  if (!payload.sessionId) {
    throw new UnauthorizedError('Token is not bound to a session');
  }
  await assertSessionActive(payload.sessionId, payload.sub);

  socket.data.user = {
    id: payload.sub,
    role: payload.role,
    email: payload.email ?? undefined,
    sessionId: payload.sessionId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Socket.io Bootstrap
//
// Attaches a Socket.io server to the Node HTTP server, configures:
//   • CORS (restricted to the CORS_ORIGIN allow-list shared with the REST API)
//   • Handshake JWT authentication + session validation
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
      origin: config.cors.allowedOrigins, // same allow-list as the REST API (CORS_ORIGIN)
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Allow both polling and WebSocket transports
    transports: ['polling', 'websocket'],
  });

  // ── Auth Middleware ─────────────────────────────────────────────────────────
  // Verifies the same access JWT as the REST API. The token is read from
  // handshake.auth.token (browser / mobile SDKs) or the Authorization header
  // (Postman and other header-capable clients), then the session is validated
  // against the database. Tokens in the query string are deliberately NOT
  // accepted (they end up in proxy / access logs).
  io.use((socket: AuthenticatedSocket, next) => {
    authenticateSocket(socket).then(
      () => next(),
      (err: unknown) => {
        // Never leak internals to the client — only the auth failure message.
        const isAuthError = err instanceof UnauthorizedError;
        if (!isAuthError) console.error('[SOCKET] Auth middleware error:', err);
        next(
          new Error(
            `Socket authentication failed: ${isAuthError ? err.message : 'internal error'}`,
          ),
        );
      },
    );
  });

  // ── Register all event handlers ─────────────────────────────────────────────
  registerSocketHandlers(io);

  console.info('✅ Socket.io server initialized');
  return io;
}
