import { RideService } from './ride.service';
import { RecurringService } from './recurring.service';
import {
  CancelRideDto,
  EstimateFareDto,
  ListRidesQuery,
  RecurringProfileDto,
  RequestRideDto,
  SearchRideDto,
  UpdateLocationDto,
  UpdateRideStatusDto,
} from './ride.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

// ─────────────────────────────────────────────────────────────────────────────
// Rides Controller
// Role checks live in ride.route.ts (authorize); validation in ride.validation.ts;
// domain errors are thrown by the services as AppErrors.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/rides — Role: CUSTOMER | DRIVER | ADMIN.
 * Paginated and scoped by role (customer: own rides, driver: assigned rides,
 * admin: all, with optional ?status= and ?userId=).
 */
const listRides = catchAsync(async (req, res) => {
  const { rides, meta } = await RideService.listRides(
    { id: req.user!.id, role: req.user!.role },
    req.query as unknown as ListRidesQuery,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Rides retrieved successfully',
    meta,
    data: { rides },
  });
});

/** GET /api/v1/rides/:id — Role: CUSTOMER | DRIVER | ADMIN. 404 when outside the caller's scope. */
const getRide = catchAsync(async (req, res) => {
  const ride = await RideService.getRide(
    { id: req.user!.id, role: req.user!.role },
    String(req.params.id),
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Ride retrieved successfully',
    data: { ride },
  });
});

/** PATCH /api/v1/rides/location — Role: DRIVER. Updates live position (Redis geo + DB). */
const updateLocation = catchAsync(async (req, res) => {
  await RideService.updateDriverLocation(req.user!.id, req.body as UpdateLocationDto);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Location updated successfully',
    data: { message: 'Location updated successfully.' },
  });
});

/** POST /api/v1/rides/search — Role: CUSTOMER. Nearby available drivers. */
const searchRide = catchAsync(async (req, res) => {
  const drivers = await RideService.findNearbyDrivers(req.body as SearchRideDto);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Nearby drivers retrieved successfully',
    data: drivers,
  });
});

/** POST /api/v1/rides/estimate — Role: CUSTOMER. Upfront fare estimates per vehicle type. */
const estimateFare = catchAsync(async (req, res) => {
  const estimates = await RideService.estimateFare(req.user!.id, req.body as EstimateFareDto);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fare estimates retrieved successfully',
    data: estimates,
  });
});

/** POST /api/v1/rides/request — Role: CUSTOMER. On-demand or scheduled ride request. */
const requestRide = catchAsync(async (req, res) => {
  const result = await RideService.requestRide(req.user!.id, req.body as RequestRideDto);

  if (result.scheduled) {
    // Scheduled ride: BullMQ job enqueued, no immediate driver dispatch.
    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: 'Ride scheduled successfully',
      data: {
        ride: result.ride,
        scheduled: true,
        message: `Ride scheduled for ${result.ride.scheduledAt?.toISOString()}. Driver search will begin 30 minutes before pickup.`,
        dispatchedDriverIds: [],
      },
    });
    return;
  }

  // On-demand ride: driver search already triggered.
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Ride requested successfully',
    data: {
      ride: result.ride,
      scheduled: false,
      dispatchedDriverIds: result.dispatchedDriverIds,
    },
  });
});

/** PATCH /api/v1/rides/:id/accept — Role: DRIVER. Atomically claims the ride. */
const acceptRide = catchAsync(async (req, res) => {
  const ride = await RideService.acceptRide(req.user!.id, String(req.params.id));

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Ride accepted successfully',
    data: { ride },
  });
});

/**
 * PATCH /api/v1/rides/:id/status — Role: DRIVER.
 * Advances to DRIVER_ARRIVED / IN_PROGRESS / COMPLETED. On COMPLETED the driver
 * is released back to the pool and ride counts are incremented.
 */
const updateRideStatus = catchAsync(async (req, res) => {
  const result = await RideService.updateRideStatus(
    req.user!.id,
    String(req.params.id),
    req.body as UpdateRideStatusDto,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Ride status updated successfully',
    data: result,
  });
});

/** POST /api/v1/rides/:id/cancel — Role: CUSTOMER | DRIVER (the ride's own participants). Cancels and releases the driver. */
const cancelRide = catchAsync(async (req, res) => {
  const ride = await RideService.cancelRide(
    req.user!.id,
    String(req.params.id),
    req.body as CancelRideDto,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Ride cancelled successfully',
    data: { ride },
  });
});

/**
 * POST /api/v1/rides/:id/share — Role: CUSTOMER | DRIVER.
 * Generates a 24-hour tracking token (Redis) and a public tracking URL; a guest
 * can use the token to join the Socket.io room read-only.
 */
const shareRide = catchAsync(async (req, res) => {
  const result = await RideService.shareRide(req.user!.id, String(req.params.id));

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Ride shared successfully',
    data: result,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Recurring Rides  —  PRD 3.9
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/v1/rides/recurring — Role: CUSTOMER. Creates a RecurringRideProfile. */
const createRecurringProfile = catchAsync(async (req, res) => {
  const profile = await RecurringService.createRecurringProfile(
    req.user!.id,
    req.body as RecurringProfileDto,
  );

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Recurring ride profile created successfully',
    data: { profile },
  });
});

/** GET /api/v1/rides/recurring — Role: CUSTOMER. All own recurring profiles. */
const getMyRecurringProfiles = catchAsync(async (req, res) => {
  const profiles = await RecurringService.getMyRecurringProfiles(req.user!.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Recurring ride profiles retrieved successfully',
    data: { profiles, total: profiles.length },
  });
});

/** DELETE /api/v1/rides/recurring/:id — Role: CUSTOMER. Soft-deactivates a profile. */
const deactivateRecurringProfile = catchAsync(async (req, res) => {
  const profile = await RecurringService.deactivateRecurringProfile(
    req.user!.id,
    String(req.params.id),
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Recurring ride profile deactivated successfully',
    data: { profile },
  });
});

/**
 * POST /api/v1/rides/recurring/evaluate — Role: ADMIN.
 * Manually triggers the recurring-profile evaluation sweep (normally a cron job).
 */
const triggerRecurringEvaluate = catchAsync(async (_req, res) => {
  const result = await RecurringService.evaluateRecurringProfiles();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Recurring rides evaluated successfully',
    data: result,
  });
});

export const RideController = {
  listRides,
  getRide,
  updateLocation,
  searchRide,
  estimateFare,
  requestRide,
  acceptRide,
  updateRideStatus,
  cancelRide,
  shareRide,
  createRecurringProfile,
  getMyRecurringProfiles,
  deactivateRecurringProfile,
  triggerRecurringEvaluate,
};
