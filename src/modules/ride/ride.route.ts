import { Router } from 'express';
import { RideController } from './ride.controller';
import { RideValidation } from './ride.validation';
import { validateRequest } from '../../middlewares/validateRequest';
import { authenticate, authorize } from '../../middlewares/auth';
import { rideRateLimiter } from '../../middlewares/rateLimiter';

// ─────────────────────────────────────────────────────────────────────────────
// Rides Router
// Mounted at: /api/v1/rides  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router: Router = Router();

/**
 * PATCH /api/v1/rides/location
 * Driver → broadcast live GPS to Redis + Postgres
 * Auth: Bearer JWT (role: DRIVER)
 * Body: { lat, lng }
 */
router.patch(
  '/location',
  authenticate,
  authorize('DRIVER'),
  validateRequest(RideValidation.updateLocation),
  RideController.updateLocation,
);

/**
 * POST /api/v1/rides/search
 * Customer → find nearby available/approved drivers within 5 km
 * Auth: Bearer JWT (role: CUSTOMER)
 * Body: { pickupLat, pickupLng }
 */
router.post(
  '/search',
  authenticate,
  authorize('CUSTOMER'),
  validateRequest(RideValidation.searchRide),
  RideController.searchRide,
);

/**
 * POST /api/v1/rides/estimate
 * Customer → get fare estimates for all vehicle tiers (no DB write)
 * Auth: Bearer JWT (role: CUSTOMER)
 * Body: { pickupLat, pickupLng, dropoffLat, dropoffLng, stops? }
 */
router.post(
  '/estimate',
  authenticate,
  authorize('CUSTOMER'),
  rideRateLimiter,
  validateRequest(RideValidation.estimateFare),
  RideController.estimateFare,
);

/**
 * POST /api/v1/rides/request
 * Customer → create Ride record + dispatch to nearby eligible drivers
 * Auth: Bearer JWT (role: CUSTOMER)
 * Body: { pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng,
 *         dropoffAddress, vehicleType, estimatedFare, stops? }
 */
router.post(
  '/request',
  authenticate,
  authorize('CUSTOMER'),
  rideRateLimiter,
  validateRequest(RideValidation.requestRide),
  RideController.requestRide,
);

// ── Recurring Rides (PRD 3.9) — must be BEFORE /:id routes ───────────────────

/**
 * POST /api/v1/rides/recurring
 * Customer → submit a recurring ride template
 * Auth: Bearer JWT (role: CUSTOMER)
 */
router.post(
  '/recurring',
  authenticate,
  authorize('CUSTOMER'),
  validateRequest(RideValidation.createRecurringProfile),
  RideController.createRecurringProfile,
);

/**
 * GET /api/v1/rides/recurring
 * Customer → list their recurring profiles
 * Auth: Bearer JWT (role: CUSTOMER)
 */
router.get(
  '/recurring',
  authenticate,
  authorize('CUSTOMER'),
  RideController.getMyRecurringProfiles,
);

/**
 * POST /api/v1/rides/recurring/evaluate
 * Admin → manually trigger the recurring ride factory sweep
 * Auth: Bearer JWT (role: ADMIN)
 */
router.post(
  '/recurring/evaluate',
  authenticate,
  authorize('ADMIN'),
  RideController.triggerRecurringEvaluate,
);

/**
 * DELETE /api/v1/rides/recurring/:id
 * Customer → deactivate a recurring profile
 * Auth: Bearer JWT (role: CUSTOMER)
 */
router.delete(
  '/recurring/:id',
  authenticate,
  authorize('CUSTOMER'),
  RideController.deactivateRecurringProfile,
);

// ── Parameterised routes (must come AFTER all static routes) ─────────────────

/**
 * PATCH /api/v1/rides/:id/accept
 * Driver → atomically claim a REQUESTED ride
 * Auth: Bearer JWT (role: DRIVER)
 */
router.patch('/:id/accept', authenticate, authorize('DRIVER'), RideController.acceptRide);

/**
 * PATCH /api/v1/rides/:id/status
 * Driver → advance trip to DRIVER_ARRIVED | IN_PROGRESS | COMPLETED
 * Auth: Bearer JWT (role: DRIVER)
 * Body: { status, finalDistanceKm?, finalDurationMinutes? }
 */
router.patch(
  '/:id/status',
  authenticate,
  authorize('DRIVER'),
  validateRequest(RideValidation.updateRideStatus),
  RideController.updateRideStatus,
);

/**
 * POST /api/v1/rides/:id/cancel
 * Customer or Driver → cancel a non-terminal ride
 * Auth: Bearer JWT (role: CUSTOMER or DRIVER)
 * Body: { reason }
 */
router.post(
  '/:id/cancel',
  authenticate,
  authorize('CUSTOMER'),
  validateRequest(RideValidation.cancelRide),
  RideController.cancelRide,
);

/**
 * POST /api/v1/rides/:id/share
 * Customer → generate 24-hour tracking token + public URL
 * Auth: Bearer JWT (role: CUSTOMER)
 */
router.post('/:id/share', authenticate, authorize('CUSTOMER', 'DRIVER'), RideController.shareRide);

export default router;
