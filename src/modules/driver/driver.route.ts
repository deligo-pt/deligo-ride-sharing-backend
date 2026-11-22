import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { kycUpload } from '../../middlewares/uploadMiddleware';
import {
  getMyDashboardHandler,
  getTripHistoryHandler,
  uploadDocumentsHandler,
} from './driver.controller';
import { REQUIRED_KYC_DOCUMENTS } from './driver.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Drivers Router  —  PRD 2.2
// Mounted at: /api/v1/drivers  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router: Router = Router();

/**
 * GET /api/v1/drivers/me
 * Role: DRIVER
 *
 * Driver dashboard — returns the full profile with vehicle, KYC document
 * status, averageRating, and totalRides metrics.
 *
 * IMPORTANT: This route must be declared BEFORE any /:id routes to prevent
 * "me" being matched as an ID parameter.
 */
router.get('/me', authenticate, getMyDashboardHandler);

/**
 * GET /api/v1/drivers/me/history
 * Role: DRIVER
 *
 * Paginated trip history (COMPLETED + CANCELLED) for the authenticated driver.
 * Query params: ?page=1&limit=10
 */
router.get('/me/history', authenticate, getTripHistoryHandler);

/**
 * POST /api/v1/drivers/documents
 * Role: DRIVER
 *
 * Bulk upload all 7 required KYC documents as multipart/form-data.
 * File fields must be named after DocumentType values (e.g. DRIVING_LICENSE).
 * Optional text fields: DRIVING_LICENSE_expiryDate, VEHICLE_REGISTRATION_expiryDate,
 * VEHICLE_INSURANCE_expiryDate (ISO 8601).
 *
 * Multer buffers each file in memory — no disk writes. The controller streams
 * each buffer directly to Cloudinary via upload_stream.
 */
router.post(
  '/documents',
  authenticate,
  kycUpload.fields(REQUIRED_KYC_DOCUMENTS.map((doc) => ({ name: doc.type, maxCount: 1 }))),
  uploadDocumentsHandler,
);

export default router;
