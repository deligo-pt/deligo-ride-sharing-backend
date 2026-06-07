import 'dotenv/config'; // Must be the VERY FIRST import to load .env
import http from 'http';
import { createApp } from './app';
import prisma from './config/db';
import { env } from './config/env';
import { NotificationEngine } from './domains/notifications/notifications.service';
import { initSocketServer } from './sockets';

// Server Entry Point

async function bootstrap(): Promise<void> {
  // ── 1. Verify database connectivity before binding the HTTP port ───────────
  try {
    await prisma.$connect();
    console.info('✅ Database connection established');
  } catch (err) {
    console.error('❌ Failed to connect to the database:', err);
    process.exit(1);
  }

  // ── 2. Create Express app + HTTP server + Socket.io ────────────────────────
  const app    = createApp();
  const server = http.createServer(app);

  // Attach Socket.io to the same HTTP server (same port as REST)
  const io = initSocketServer(server);

  // Give NotificationEngine access to the io instance so it can push
  // real-time notifications to user rooms from anywhere in the codebase.
  NotificationEngine.setIo(io);

  server.listen(env.PORT, () => {
    console.info(`🚀 Server running on http://localhost:${env.PORT}`);
    console.info(`   Environment : ${env.NODE_ENV}`);
    console.info(`   Health      : http://localhost:${env.PORT}/health`);
    console.info(`   API         : http://localhost:${env.PORT}/api/v1`);
    console.info(`   WebSocket   : ws://localhost:${env.PORT}`);
  });

  // ── 3. Graceful Shutdown ───────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    console.info(`\n🛑 Received ${signal}. Shutting down gracefully...`);

    server.close(async () => {
      console.info('   HTTP server closed');
      try {
        await prisma.$disconnect();
        console.info('   Database disconnected');
      } catch (err) {
        console.error('   Error during database disconnect:', err);
      }
      console.info('✅ Shutdown complete');
      process.exit(0);
    });

    // Force shutdown after 10 seconds if graceful shutdown stalls
    setTimeout(() => {
      console.error('⚠️  Force shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // ── 4. Unhandled rejection / exception handlers ────────────────────────────
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('💥 Unhandled Promise Rejection:', reason);
    void shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err: Error) => {
    console.error('💥 Uncaught Exception:', err);
    void shutdown('uncaughtException');
  });
}

void bootstrap();
