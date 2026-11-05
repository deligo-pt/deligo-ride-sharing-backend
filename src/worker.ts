import 'dotenv/config'; // Must be the VERY FIRST import to load .env
import Redis from 'ioredis';
import prisma from './config/db';
import { env } from './config/env';
import { rideWorker } from './queues/ride.worker';

// Dedicated BullMQ Worker Service Entry Point

async function bootstrapWorker(): Promise<void> {
  console.info('🛠️  Starting Deligo Dedicated BullMQ Worker Service...');

  // ── 1. Verify database connectivity ─────────────────────────────────────────
  try {
    await prisma.$connect();
    console.info('✅ Database connection established (Worker)');
  } catch (err) {
    console.error('❌ Failed to connect to the database (Worker):', err);
    process.exit(1);
  }

  // ── 2. Verify Redis connectivity ───────────────────────────────────────────
  const redisProbe = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  try {
    await redisProbe.ping();
    console.info('✅ Redis connection verified (Worker)');
    await redisProbe.quit();
  } catch (err) {
    console.error('❌ Failed to connect to Redis (Worker):', err);
    process.exit(1);
  }

  console.info('🚀 BullMQ Worker Service is active and listening for scheduled ride jobs');

  // ── 3. Graceful Shutdown ───────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    console.info(`\n🛑 Received ${signal}. Shutting down worker gracefully...`);

    try {
      await rideWorker.close();
      console.info('   BullMQ worker closed');
      await prisma.$disconnect();
      console.info('   Database disconnected');
      console.info('✅ Worker shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('   Error during worker shutdown cleanup:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // ── 4. Unhandled rejection / exception handlers ────────────────────────────
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('💥 Unhandled Promise Rejection in Worker:', reason);
    void shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err: Error) => {
    console.error('💥 Uncaught Exception in Worker:', err);
    void shutdown('uncaughtException');
  });
}

void bootstrapWorker();

