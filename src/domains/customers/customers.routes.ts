import { Router } from 'express';
import { requireAuth } from '../../middlewares/mockAuth';
import { kycUpload } from '../../middlewares/uploadMiddleware';
import * as customersController from './customers.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Customers Router — PRD 2.1
// Mounted at: /api/v1/customers  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/v1/customers/me
 * Returns the authenticated customer's profile + saved locations.
 * Headers: x-mock-user-id | x-mock-role: CUSTOMER
 */
router.get('/me', requireAuth, customersController.getMyProfile);

/**
 * PATCH /api/v1/customers/me
 * Update firstName and/or lastName.
 * Headers: x-mock-user-id | x-mock-role: CUSTOMER
 * Body: { firstName?, lastName? }
 */
router.patch('/me', requireAuth, customersController.updateMyProfile);

/**
 * POST /api/v1/customers/me/avatar
 * Upload a profile picture (multipart/form-data, field: "avatar").
 * Uses the shared kycUpload multer middleware (memory storage, ≤10 MB).
 * Headers: x-mock-user-id | x-mock-role: CUSTOMER
 */
router.post('/me/avatar', requireAuth, kycUpload.single('avatar'), customersController.uploadAvatar);

/**
 * POST /api/v1/customers/locations
 * Create a saved location.
 * Headers: x-mock-user-id | x-mock-role: CUSTOMER
 * Body: { name, address, lat, lng }
 */
router.post('/locations', requireAuth, customersController.createSavedLocation);

/**
 * DELETE /api/v1/customers/locations/:id
 * Soft-delete a saved location by ID.
 * Headers: x-mock-user-id | x-mock-role: CUSTOMER
 */
router.delete('/locations/:id', requireAuth, customersController.deleteSavedLocation);

export default router;
