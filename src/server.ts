import 'dotenv/config';
import http from 'http';
import type { Worker } from 'bullmq';

import { createApp } from './app';
import prisma from './config/db';
import { config } from './config';
import { NotificationService } from './modules/notification/notification.service';
import { initSocketServer } from './sockets';
import { rideWorker } from './queues/ride.worker';
import { ensureRustFSBucketExists } from './utils/rustfs.util';
import { seedSuperAdmin } from './seed/superadmin';

// Server Entry Point

async function bootstrap(): Promise<void> {
  // 1. Verify database connectivity
  try {
    await prisma.$connect();
    console.info('✅ Database connection established');
  } catch (err) {
    console.error('❌ Failed to connect to the database:', err);
    process.exit(1);
  }

  // 2. Ensure object storage bucket exists
  await ensureRustFSBucketExists();

  // 3. Seed Super Admin
  await seedSuperAdmin(prisma, config);
  console.info('✅ Seed admin created');

  // 4. Create Express app and HTTP server
  const app = createApp();
  const server = http.createServer(app);

  // 5. Initialize Socket.io
  const io = initSocketServer(server);
  NotificationService.setIo(io);

  // 6. Initialize embedded worker if enabled
  let activeWorker: Worker | null = null;

  if (config.worker.embedded) {
    activeWorker = rideWorker;
    console.info('⚙️ Embedded BullMQ worker initialized in server process');
  } else {
    console.info('ℹ️ Embedded BullMQ worker disabled (ENABLE_WORKER=false)');
  }

  // 7. Start HTTP server
  server.listen(config.port, () => {
    console.info(`🚀 Server running on http://localhost:${config.port}`);
    console.info(`   Environment : ${config.env}`);
    console.info(`   Health      : http://localhost:${config.port}/health`);
    console.info(`   API         : http://localhost:${config.port}/api/v1`);
    console.info(`   WebSocket   : ws://localhost:${config.port}`);
  });

  // 8. Graceful Shutdown
  const shutdown = (signal: string): void => {
    console.info(`\n🛑 Received ${signal}. Shutting down gracefully...`);

    const cleanup = async (): Promise<void> => {
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
      console.info('   HTTP server closed');
      void cleanup();
    });

    setTimeout(() => {
      console.error('⚠️ Force shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // 9. Unhandled errors
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
