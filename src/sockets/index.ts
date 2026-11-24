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

function extractHandshakeToken(socket: AuthenticatedSocket): string | undefined {
  const auth = socket.handshake.auth as { token?: unknown };
  const raw =
    (typeof auth?.token === 'string' ? auth.token : undefined) ??
    socket.handshake.headers.authorization;

  if (!raw) return undefined;
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
  return token.trim() || undefined;
}

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
      origin: config.cors.allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },

    transports: ['polling', 'websocket'],
  });

  io.use((socket: AuthenticatedSocket, next) => {
    authenticateSocket(socket).then(
      () => next(),
      (err: unknown) => {
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

  registerSocketHandlers(io);

  console.info('✅ Socket.io server initialized');
  return io;
}
