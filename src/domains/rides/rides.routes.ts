import { Router } from 'express';
import { requireAuth } from '../../middlewares/mockAuth';
import * as ridesController from './rides.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Rides Router
// Mounted at: /api/v1/rides  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

/**
 * PATCH /api/v1/rides/location
 *
 * Driver broadcasts their live GPS coordinates to Redis.
 *
 * Required headers:
 *   x-mock-user-id : <driver user UUID>
 *   x-mock-role    : DRIVER
 *
 * Body: { lat: number, lng: number }
 */
router.patch('/location', requireAuth, ridesController.updateLocation);

/**
 * POST /api/v1/rides/search
 *
 * Customer searches for nearby, available, KYC-approved drivers.
 *
 * Required headers:
 *   x-mock-user-id : <customer user UUID>
 *   x-mock-role    : CUSTOMER
 *
 * Body: { pickupLat: number, pickupLng: number }
 */
router.post('/search', requireAuth, ridesController.searchRide);

export default router;
