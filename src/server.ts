import 'dotenv/config'; // Must be the VERY FIRST import to load .env
import http from 'http';
import type { Worker } from 'bullmq';
import { createApp } from './app';
import prisma from './config/db';
import { env } from './config/env';
import { NotificationEngine } from './domains/notifications/notifications.service';
import { initSocketServer } from './sockets';
import { rideWorker } from './queues/ride.worker';

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
  const app = createApp();
  const server = http.createServer(app);

  // Attach Socket.io to the same HTTP server (same port as REST)
  const io = initSocketServer(server);

  // Give NotificationEngine access to the io instance so it can push
  // real-time notifications to user rooms from anywhere in the codebase.
  NotificationEngine.setIo(io);

  // ── Optional: Embedded Worker (if not running dedicated worker container) ──
  let activeWorker: Worker | null = null;
  if (process.env.ENABLE_WORKER !== 'false') {
    activeWorker = rideWorker;
    console.info('⚙️  Embedded BullMQ worker initialized in server process');
  } else {
    console.info('ℹ️  Embedded BullMQ worker disabled (ENABLE_WORKER=false)');
  }

  server.listen(env.PORT, () => {
    console.info(`🚀 Server running on http://localhost:${env.PORT}`);
    console.info(`   Environment : ${env.NODE_ENV}`);
    console.info(`   Health      : http://localhost:${env.PORT}/health`);
    console.info(`   API         : http://localhost:${env.PORT}/api/v1`);
    console.info(`   WebSocket   : ws://localhost:${env.PORT}`);
  });

  // ── 3. Graceful Shutdown ───────────────────────────────────────────────────
  const shutdown = (signal: string): void => {
    console.info(`\n🛑 Received ${signal}. Shutting down gracefully...`);

    const cleanup = async (): Promise<void> => {
      console.info('   HTTP server closed');
      try {
        if (activeWorker) {
          await activeWorker.close();
          console.info('   BullMQ worker closed');
        }
        await prisma.$disconnect();
        console.info('   Database disconnected');
      } catch (err) {
        console.error('   Error during shutdown cleanup:', err);
      }
      console.info('✅ Shutdown complete');
      process.exit(0);
    };

    server.close(() => {
      void cleanup();
    });

    // Force shutdown after 10 seconds if graceful shutdown stalls
    setTimeout(() => {
      console.error('⚠️  Force shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ── 4. Unhandled rejection / exception handlers ────────────────────────────
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('💥 Unhandled Promise Rejection:', reason);
    shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err: Error) => {
    console.error('💥 Uncaught Exception:', err);
    shutdown('uncaughtException');
  });
}

void bootstrap();
