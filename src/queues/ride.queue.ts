import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { config } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// Ride Scheduling Queue
//
// Uses a single BullMQ Queue backed by the same ioredis instance used for
// geospatial tracking, so we don't open an extra Redis connection.
//
// Job payload: { rideId: string }
// The worker is responsible for fetching the full ride from Postgres.
// ─────────────────────────────────────────────────────────────────────────────

export const RIDE_QUEUE_NAME = 'ride-scheduling';

/** How many minutes before scheduledAt we begin searching for a driver. */
const DISPATCH_LEAD_TIME_MS = 30 * 60 * 1000; // 30 minutes

export interface ScheduledRideJobData {
  rideId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ needs plain ConnectionOptions (host/port/auth/TLS), not a shared
// ioredis instance, because BullMQ bundles its own pinned version of ioredis.
// Built from REDIS_URL with the native URL parser, so usernames, passwords and
// rediss:// (TLS) URLs from managed Redis providers work.
// ─────────────────────────────────────────────────────────────────────────────

export function parseBullMQConnection(redisUrl: string = config.redis.url): ConnectionOptions {
  // Tolerate a bare "host:port" (no scheme) so legacy configs keep working.
  const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(redisUrl) ? redisUrl : `redis://${redisUrl}`;
  const url = new URL(normalized);

  const dbPath = url.pathname.replace(/^\//, '');
  const db = dbPath ? parseInt(dbPath, 10) : undefined;

  return {
    host: url.hostname || '127.0.0.1',
    port: url.port ? parseInt(url.port, 10) : 6379,
    // WHATWG URL leaves userinfo percent-encoded — decode before use.
    ...(url.username && { username: decodeURIComponent(url.username) }),
    ...(url.password && { password: decodeURIComponent(url.password) }),
    ...(db !== undefined && !Number.isNaN(db) && { db }),
    // rediss:// → TLS (managed Redis: Upstash, ElastiCache in-transit encryption, …)
    ...(url.protocol === 'rediss:' && { tls: { servername: url.hostname } }),
  };
}

export const bullmqConnection: ConnectionOptions = parseBullMQConnection();

export const rideQueue = new Queue<ScheduledRideJobData>(RIDE_QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    // A job is removed from Redis after it completes or fails to keep memory lean.
    removeOnComplete: { age: 3600, count: 100 },  // keep for 1 h max
    removeOnFail:    { age: 86_400, count: 500 },  // keep failures for 24 h for debugging
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5_000, // 5 s initial, then 10 s, 20 s
    },
  },
});

/**
 * Schedule a BullMQ delayed job so the worker dispatches a driver search
 * 30 minutes before the customer's requested pickup time.
 *
 * @param rideId      The Ride row ID to process when the job fires.
 * @param scheduledAt The customer's requested pickup time.
 *
 * Delay logic:
 *   targetFireAt = scheduledAt - 30 min
 *   delay        = targetFireAt - now()
 *
 * If delay ≤ 0 (i.e. the ride is scheduled less than 30 minutes away, or in
 * the past), the job is enqueued with delay = 0 and fires immediately.
 */
export async function addScheduledRideJob(
  rideId: string,
  scheduledAt: Date,
): Promise<void> {
  const targetFireAt = scheduledAt.getTime() - DISPATCH_LEAD_TIME_MS;
  const delay = Math.max(0, targetFireAt - Date.now());

  await rideQueue.add(
    'dispatch-scheduled-ride',
    { rideId },
    {
      delay,
      jobId: `scheduled-ride:${rideId}`, // idempotent — prevents duplicate jobs
    },
  );

  console.info(
    `[RideQueue] Scheduled job for ride ${rideId}. ` +
    `Fires in ${Math.round(delay / 1000)}s ` +
    `(${delay === 0 ? 'immediate' : new Date(Date.now() + delay).toISOString()})`,
  );
}
