import { Worker, Job } from 'bullmq';
import prisma from '../config/db';
import { LocationService } from '../utils/redis';
import {
  NotificationService,
  logNotificationFailure,
} from '../modules/notification/notification.service';
import { NEARBY_DRIVER_RADIUS_KM } from '../modules/ride/ride.constant';
import { RIDE_QUEUE_NAME, ScheduledRideJobData, bullmqConnection } from './ride.queue';

async function processScheduledRide(job: Job<ScheduledRideJobData>): Promise<void> {
  const { rideId } = job.data;

  console.info(`[RideWorker] Processing job ${job.id} for ride ${rideId}`);

  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      status: true,
      pickupLatitude: true,
      pickupLongitude: true,
      vehicleType: true,
      pickupAddress: true,
    },
  });

  if (!ride) {
    console.warn(`[RideWorker] Ride ${rideId} not found. Skipping.`);
    return;
  }

  if (ride.status === 'CANCELLED' || ride.status === 'COMPLETED') {
    console.info(`[RideWorker] Ride ${rideId} is already ${ride.status}. Skipping dispatch.`);
    return;
  }

  await prisma.ride.update({
    where: { id: rideId },
    data: {
      status: 'REQUESTED',
      requestedAt: new Date(),
    },
  });

  console.info(`[RideWorker] Ride ${rideId} status → REQUESTED`);

  const candidateUserIds = await LocationService.findNearbyDrivers(
    ride.pickupLongitude,
    ride.pickupLatitude,
    NEARBY_DRIVER_RADIUS_KM,
  );

  if (candidateUserIds.length === 0) {
    console.warn(
      `[RideWorker] No drivers in Redis geo-set near ride ${rideId}. Dispatch queued but no candidates found.`,
    );
    return;
  }

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

  if (dispatchedDriverIds.length > 0) {
    await NotificationService.sendToUsers(dispatchedDriverIds, {
      type: 'RIDE_REQUEST',
      title: 'New ride request',
      message: `Pickup: ${ride.pickupAddress}`,
      data: { rideId: ride.id, vehicleType: ride.vehicleType, pickupAddress: ride.pickupAddress },
    }).catch(logNotificationFailure('scheduled-ride-request'));
  }
}

export const rideWorker = new Worker<ScheduledRideJobData>(RIDE_QUEUE_NAME, processScheduledRide, {
  connection: bullmqConnection,
  concurrency: 5,
});

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
