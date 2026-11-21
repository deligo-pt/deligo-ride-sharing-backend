import { Router } from 'express';
import { requireAuth } from '../../middlewares/mockAuth';
import * as ridesController from './rides.controller';
import { authenticate, authorize } from '../../middlewares/auth';

// ─────────────────────────────────────────────────────────────────────────────
// Rides Router
// Mounted at: /api/v1/rides  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

/**
 * PATCH /api/v1/rides/location
 * Driver → broadcast live GPS to Redis + Postgres
 * Headers: x-mock-user-id | x-mock-role: DRIVER
 * Body: { lat, lng }
 */
router.patch(
  '/location',
  requireAuth,
  authenticate,
  authorize('DRIVER'),
  ridesController.updateLocation,
);

/**
 * POST /api/v1/rides/search
 * Customer → find nearby available/approved drivers within 5 km
 * Headers: x-mock-user-id | x-mock-role: CUSTOMER
 * Body: { pickupLat, pickupLng }
 */
router.post(
  '/search',
  requireAuth,
  authenticate,
  authorize('CUSTOMER'),
  ridesController.searchRide,
);

/**
 * POST /api/v1/rides/estimate
 * Customer → get fare estimates for all vehicle tiers (no DB write)
 * Headers: x-mock-user-id | x-mock-role: CUSTOMER
 * Body: { pickupLat, pickupLng, dropoffLat, dropoffLng, stops? }
 */
router.post(
  '/estimate',
  requireAuth,
  authenticate,
  authorize('CUSTOMER'),
  ridesController.estimateFare,
);

/**
 * POST /api/v1/rides/request
 * Customer → create Ride record + dispatch to nearby eligible drivers
 * Headers: x-mock-user-id | x-mock-role: CUSTOMER
 * Body: { pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng,
 *         dropoffAddress, vehicleType, estimatedFare, stops? }
 */
router.post(
  '/request',
  requireAuth,
  authenticate,
  authorize('CUSTOMER'),
  ridesController.requestRide,
);

// ── Recurring Rides (PRD 3.9) — must be BEFORE /:id routes ───────────────────

/**
 * POST /api/v1/rides/recurring
 * Customer → submit a recurring ride template
 * Headers: x-mock-role: CUSTOMER
 */
router.post(
  '/recurring',
  requireAuth,
  authenticate,
  authorize('CUSTOMER'),
  ridesController.createRecurringProfile,
);

/**
 * GET /api/v1/rides/recurring
 * Customer → list their recurring profiles
 * Headers: x-mock-role: CUSTOMER
 */
router.get(
  '/recurring',
  requireAuth,
  authenticate,
  authorize('CUSTOMER'),
  ridesController.getMyRecurringProfiles,
);

/**
 * POST /api/v1/rides/recurring/evaluate
 * Admin → manually trigger the recurring ride factory sweep
 * Headers: x-mock-role: ADMIN
 */
router.post(
  '/recurring/evaluate',
  requireAuth,
  authenticate,
  authorize('ADMIN'),
  ridesController.triggerRecurringEvaluate,
);

/**
 * DELETE /api/v1/rides/recurring/:id
 * Customer → deactivate a recurring profile
 * Headers: x-mock-role: CUSTOMER
 */
router.delete(
  '/recurring/:id',
  requireAuth,
  authenticate,
  authorize('CUSTOMER'),
  ridesController.deactivateRecurringProfile,
);

// ── Parameterised routes (must come AFTER all static routes) ─────────────────

/**
 * PATCH /api/v1/rides/:id/accept
 * Driver → atomically claim a REQUESTED ride
 * Headers: x-mock-role: DRIVER
 */
router.patch(
  '/:id/accept',
  requireAuth,
  authenticate,
  authorize('DRIVER'),
  ridesController.acceptRide,
);

/**
 * PATCH /api/v1/rides/:id/status
 * Driver → advance trip to DRIVER_ARRIVED | IN_PROGRESS | COMPLETED
 * Headers: x-mock-role: DRIVER
 * Body: { status, finalDistanceKm?, finalDurationMinutes? }
 */
router.patch(
  '/:id/status',
  requireAuth,
  authenticate,
  authorize('DRIVER'),
  ridesController.updateRideStatus,
);

/**
 * POST /api/v1/rides/:id/cancel
 * Customer or Driver → cancel a non-terminal ride
 * Headers: x-mock-role: CUSTOMER or DRIVER
 * Body: { reason }
 */
router.post(
  '/:id/cancel',
  requireAuth,
  authenticate,
  authorize('CUSTOMER'),
  ridesController.cancelRide,
);

/**
 * POST /api/v1/rides/:id/share
 * Customer → generate 24-hour tracking token + public URL
 * Headers: x-mock-role: CUSTOMER
 */
router.post(
  '/:id/share',
  requireAuth,
  authenticate,
  authorize('CUSTOMER', 'DRIVER'),
  ridesController.shareRide,
);

export default router;
