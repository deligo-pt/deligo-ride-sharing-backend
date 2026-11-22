import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
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
import {
  getTicketsHandler,
  updateTicketHandler,
  addTicketMessageHandler,
} from './admin.support.controller';
import {
  ListTicketsQuerySchema,
  UpdateTicketSchema,
  AddTicketMessageSchema,
  TicketIdParamSchema,
} from './admin.support.validation';
import {
  getRidesHandler,
  cancelRideHandler,
} from './admin.rides.controller';
import {
  ListRidesQuerySchema,
  CancelRideSchema,
  RideIdParamSchema,
} from './admin.rides.validation';
import {
  broadcastNotificationHandler,
} from './admin.notifications.controller';
import {
  BroadcastNotificationSchema,
} from './admin.notifications.validation';
import {
  getPricingRulesHandler,
  updatePricingRuleHandler,
} from './admin.pricing.controller';
import {
  VehicleTypeParamSchema,
  UpdatePricingRuleSchema,
} from './admin.pricing.validation';
import {
  getPromotionsHandler,
  updatePromotionHandler,
} from './admin.promotions.controller';
import {
  ListPromotionsQuerySchema,
  PromoIdParamSchema,
  DeactivatePromotionSchema,
} from './admin.promotions.validation';
import {
  getLedgerHandler,
} from './admin.finances.controller';
import {
  GetLedgerQuerySchema,
} from './admin.finances.validation';
import {
  getDashboardHandler,
  getTrendsHandler,
  exportReportHandler,
} from './admin.analytics.controller';
import {
  GetTrendsQuerySchema,
  ExportReportQuerySchema,
} from './admin.analytics.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Router  —  PRD 5.x
// Mounted at: /api/v1/admin  (see app.ts)
//
// All routes require a valid Bearer JWT with role ADMIN (enforced via router.use below).
// ─────────────────────────────────────────────────────────────────────────────

const router: Router = Router();

// Every admin endpoint requires a valid JWT belonging to an ADMIN user.
router.use(authenticate, authorize('ADMIN'));

// ── KYC Review ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/kyc/pending
 *
 * Returns all DriverProfiles whose kycStatus is UNDER_REVIEW or PENDING_DOCS,
 * including full user info and the submitted document URLs for review.
 */
router.get('/kyc/pending', getPendingKycHandler);

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
  validate({
    params: UserIdParamSchema,
    body: UpdateUserStatusSchema,
  }),
  updateUserStatusHandler,
);

// ── Support Tickets (PRD 5.11) ──────────────────────────────────────────────

router.get(
  '/support/tickets',
  validate({ query: ListTicketsQuerySchema }),
  getTicketsHandler,
);

router.patch(
  '/support/tickets/:id',
  validate({
    params: TicketIdParamSchema,
    body: UpdateTicketSchema,
  }),
  updateTicketHandler,
);

router.post(
  '/support/tickets/:id/messages',
  validate({
    params: TicketIdParamSchema,
    body: AddTicketMessageSchema,
  }),
  addTicketMessageHandler,
);

// ── Ride Management (PRD 5.4) ───────────────────────────────────────────────

router.get(
  '/rides',
  validate({ query: ListRidesQuerySchema }),
  getRidesHandler,
);

router.patch(
  '/rides/:id/cancel',
  validate({
    params: RideIdParamSchema,
    body: CancelRideSchema,
  }),
  cancelRideHandler,
);

// ── Broadcast Notifications (PRD 5.9) ───────────────────────────────────────

router.post(
  '/notifications/broadcast',
  validate({ body: BroadcastNotificationSchema }),
  broadcastNotificationHandler,
);

// ── Financial Controller & Pricing (PRD 5.5, 5.6, 5.8) ──────────────────────

router.get(
  '/pricing',
  getPricingRulesHandler,
);

router.patch(
  '/pricing/:vehicleType',
  validate({
    params: VehicleTypeParamSchema,
    body: UpdatePricingRuleSchema,
  }),
  updatePricingRuleHandler,
);

router.get(
  '/promotions',
  validate({ query: ListPromotionsQuerySchema }),
  getPromotionsHandler,
);

router.patch(
  '/promotions/:id',
  validate({
    params: PromoIdParamSchema,
    body: DeactivatePromotionSchema,
  }),
  updatePromotionHandler,
);

router.get(
  '/finances/ledger',
  validate({ query: GetLedgerQuerySchema }),
  getLedgerHandler,
);

// ── Analytics & Business Intelligence (PRD 5.1, 5.12) ─────────────────────

router.get(
  '/analytics/dashboard',
  getDashboardHandler,
);

router.get(
  '/analytics/trends',
  validate({ query: GetTrendsQuerySchema }),
  getTrendsHandler,
);

router.get(
  '/analytics/export',
  validate({ query: ExportReportQuerySchema }),
  exportReportHandler,
);

export default router;
