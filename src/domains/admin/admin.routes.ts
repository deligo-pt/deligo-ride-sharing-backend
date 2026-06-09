import { Router } from 'express';
import { requireAuth } from '../../middlewares/mockAuth';
import { validate } from '../../middlewares/validate';
import {
  getPendingKycHandler,
  reviewKycHandler,
  listUsersHandler,
  updateUserStatusHandler,
} from './admin.controller';
import {
  ReviewKycSchema,
  DriverProfileIdParamSchema,
  ListUsersQuerySchema,
  UserIdParamSchema,
  UpdateUserStatusSchema,
} from './admin.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Router  —  PRD 5.x
// Mounted at: /api/v1/admin  (see app.ts)
//
// All routes require:
//   x-mock-user-id  —  UUID of an existing admin user
//   x-mock-role     —  must be "ADMIN"
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// ── KYC Review ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/kyc/pending
 *
 * Returns all DriverProfiles whose kycStatus is UNDER_REVIEW or PENDING_DOCS,
 * including full user info and the submitted document URLs for review.
 */
router.get('/kyc/pending', requireAuth, getPendingKycHandler);

/**
 * PATCH /api/v1/admin/kyc/:driverProfileId
 *
 * Approve or reject a driver's KYC submission.
 * Body: { kycStatus, rejectionReason?, reviewNote? }
 *
 * On APPROVED: sets DriverDocument.verificationStatus → APPROVED,
 *              DriverProfile.kycStatus → APPROVED,
 *              User.status → ACTIVE.
 *
 * On REJECTED: sets DriverDocument.verificationStatus → REJECTED,
 *              DriverProfile.kycStatus → REJECTED,
 *              User.status → PENDING_VERIFICATION.
 */
router.patch(
  '/kyc/:driverProfileId',
  requireAuth,
  validate({
    params: DriverProfileIdParamSchema,
    body: ReviewKycSchema,
  }),
  reviewKycHandler,
);

// ── User Management (PRD 5.2 & 5.3) ─────────────────────────────────────────

/**
 * GET /api/v1/admin/users
 *
 * Paginated user list. Accepts optional query params:
 *   role    — filter by CUSTOMER | DRIVER
 *   status  — filter by ACTIVE | SUSPENDED | PENDING_VERIFICATION | DEACTIVATED
 *   page    — default 1
 *   limit   — default 20, max 100
 *
 * When role=DRIVER, the response includes the nested driverProfile
 * (with vehicle info and kycStatus).
 */
router.get(
  '/users',
  requireAuth,
  validate({ query: ListUsersQuerySchema }),
  listUsersHandler,
);

/**
 * PATCH /api/v1/admin/users/:userId/status
 *
 * Manually change a user account's status.
 * Body: { status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED', reason? }
 */
router.patch(
  '/users/:userId/status',
  requireAuth,
  validate({
    params: UserIdParamSchema,
    body: UpdateUserStatusSchema,
  }),
  updateUserStatusHandler,
);

export default router;
