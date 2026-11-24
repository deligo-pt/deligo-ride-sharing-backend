import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { config } from '../config';

export const RIDE_QUEUE_NAME = 'ride-scheduling';

const DISPATCH_LEAD_TIME_MS = 30 * 60 * 1000;

export interface ScheduledRideJobData {
  rideId: string;
}

export function parseBullMQConnection(redisUrl: string = config.redis.url): ConnectionOptions {
  const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(redisUrl) ? redisUrl : `redis://${redisUrl}`;
  const url = new URL(normalized);

  const dbPath = url.pathname.replace(/^\//, '');
  const db = dbPath ? parseInt(dbPath, 10) : undefined;

  return {
    host: url.hostname || '127.0.0.1',
    port: url.port ? parseInt(url.port, 10) : 6379,

    ...(url.username && { username: decodeURIComponent(url.username) }),
    ...(url.password && { password: decodeURIComponent(url.password) }),
    ...(db !== undefined && !Number.isNaN(db) && { db }),

    ...(url.protocol === 'rediss:' && { tls: { servername: url.hostname } }),
  };
}

export const bullmqConnection: ConnectionOptions = parseBullMQConnection();

export const rideQueue = new Queue<ScheduledRideJobData>(RIDE_QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86_400, count: 500 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5_000,
    },
  },
});

export async function addScheduledRideJob(rideId: string, scheduledAt: Date): Promise<void> {
  const targetFireAt = scheduledAt.getTime() - DISPATCH_LEAD_TIME_MS;
  const delay = Math.max(0, targetFireAt - Date.now());

  await rideQueue.add(
    'dispatch-scheduled-ride',
    { rideId },
    {
      delay,
      jobId: `scheduled-ride:${rideId}`,
    },
  );

  console.info(
    `[RideQueue] Scheduled job for ride ${rideId}. ` +
      `Fires in ${Math.round(delay / 1000)}s ` +
      `(${delay === 0 ? 'immediate' : new Date(Date.now() + delay).toISOString()})`,
  );
}
