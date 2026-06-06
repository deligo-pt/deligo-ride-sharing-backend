import { Router } from 'express';
import { requireAuth } from '../../middlewares/mockAuth';
import * as rideController from './ride.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Rides Router
// Mounted at: /api/v1/rides  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/v1/rides/request
 *
 * Request a new ride. Requires mock auth headers:
 *   x-mock-user-id : <customer user UUID>
 *   x-mock-role    : CUSTOMER
 */
router.post('/request', requireAuth, rideController.requestRide);

export default router;
