import { Worker, Job } from 'bullmq';
import prisma from '../config/db';
import { LocationService } from '../utils/redis';
import { RIDE_QUEUE_NAME, ScheduledRideJobData, bullmqConnection } from './ride.queue';

// ─────────────────────────────────────────────────────────────────────────────
// Ride Scheduling Worker
//
// Processes jobs from the ride-scheduling queue.  When a delayed job fires
// (30 minutes before scheduledAt), the worker:
//   1. Fetches the Ride from Postgres.
//   2. Skips it if it was cancelled while waiting.
//   3. Transitions status → REQUESTED (making it visible to drivers).
//   4. Runs the same Redis geospatial + Postgres filter pipeline used by
//      the on-demand requestRide flow to find eligible nearby drivers.
//   5. Logs the dispatched driver IDs (the socket layer picks these up in
//      a future integration step).
// ─────────────────────────────────────────────────────────────────────────────

async function processScheduledRide(job: Job<ScheduledRideJobData>): Promise<void> {
  const { rideId } = job.data;

  console.info(`[RideWorker] Processing job ${job.id} for ride ${rideId}`);

  // ── 1. Fetch the ride ──────────────────────────────────────────────────────
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      status: true,
      pickupLatitude: true,
      pickupLongitude: true,
      vehicleType: true,
    },
  });

  if (!ride) {
    // The ride was hard-deleted — nothing to do.
    console.warn(`[RideWorker] Ride ${rideId} not found. Skipping.`);
    return;
  }

  // ── 2. Guard: skip terminal states ────────────────────────────────────────
  if (ride.status === 'CANCELLED' || ride.status === 'COMPLETED') {
    console.info(
      `[RideWorker] Ride ${rideId} is already ${ride.status}. Skipping dispatch.`,
    );
    return;
  }

  // ── 3. Transition status → REQUESTED ─────────────────────────────────────
  await prisma.ride.update({
    where: { id: rideId },
    data: {
      status: 'REQUESTED',
      requestedAt: new Date(), // mark when we actually opened it up to drivers
    },
  });

  console.info(`[RideWorker] Ride ${rideId} status → REQUESTED`);

  // ── 4. Geospatial candidate lookup from Redis (same as on-demand flow) ────
  const candidateUserIds = await LocationService.findNearbyDrivers(
    ride.pickupLongitude,
    ride.pickupLatitude,
    5, // 5 km radius
  );

  if (candidateUserIds.length === 0) {
    console.warn(`[RideWorker] No drivers in Redis geo-set near ride ${rideId}. Dispatch queued but no candidates found.`);
    return;
  }

  // ── 5. Postgres filter: available + matching vehicle type ─────────────────
  const eligibleDrivers = await prisma.driverProfile.findMany({
    where: {
      userId: { in: candidateUserIds },
      isAvailable: true,
      vehicle: {
        vehicleType: ride.vehicleType,
        approvalStatus: 'APPROVED',
      },
    },
    select: { userId: true },
  });

  const dispatchedDriverIds = eligibleDrivers.map((d) => d.userId);

  console.info(
    `[RideWorker] Ride ${rideId} dispatched to ${dispatchedDriverIds.length} driver(s): ` +
    `[${dispatchedDriverIds.join(', ')}]`,
  );

  // TODO: emit a Socket.io event to each driver room here once the
  // socket layer is wired to the worker process.
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker singleton — exported so server.ts can close it on graceful shutdown.
// ─────────────────────────────────────────────────────────────────────────────

export const rideWorker = new Worker<ScheduledRideJobData>(
  RIDE_QUEUE_NAME,
  processScheduledRide,
  {
    connection: bullmqConnection,
    concurrency: 5, // process up to 5 jobs in parallel
  },
);

rideWorker.on('completed', (job) => {
  console.info(`[RideWorker] Job ${job.id} completed successfully.`);
});

rideWorker.on('failed', (job, err) => {
  console.error(`[RideWorker] Job ${job?.id} failed:`, err.message);
});

rideWorker.on('error', (err) => {
  console.error('[RideWorker] Worker error:', err.message);
});

console.info('[RideWorker] Worker started and listening on queue:', RIDE_QUEUE_NAME);
