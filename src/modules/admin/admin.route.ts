import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { AdminController } from './admin.controller';
import { AdminValidation } from './admin.validation';
import { AdminSupportController } from './admin.support.controller';
import { AdminSupportValidation } from './admin.support.validation';
import { AdminRideController } from './admin.ride.controller';
import { AdminRideValidation } from './admin.ride.validation';
import { AdminNotificationController } from './admin.notification.controller';
import { AdminNotificationValidation } from './admin.notification.validation';
import { AdminPricingController } from './admin.pricing.controller';
import { AdminPricingValidation } from './admin.pricing.validation';
import { AdminPromotionController } from './admin.promotion.controller';
import { AdminPromotionValidation } from './admin.promotion.validation';
import { AdminFinanceController } from './admin.finance.controller';
import { AdminFinanceValidation } from './admin.finance.validation';
import { AdminAnalyticsController } from './admin.analytics.controller';
import { AdminAnalyticsValidation } from './admin.analytics.validation';

// Mounted at: /api/v1/admin (see src/routes/index.ts) — PRD 5.x
const router: Router = Router();

// Every admin route requires a valid session AND the ADMIN role.
router.use(authenticate, authorize('ADMIN'));

// ── Driver KYC review ─────────────────────────────────────────────────────────
router.get('/kyc/pending', AdminController.getPendingKyc);
router.patch(
  '/kyc/:driverProfileId',
  validateRequest(AdminValidation.reviewKyc),
  AdminController.reviewKyc,
);

// ── User management ───────────────────────────────────────────────────────────
router.get('/users', validateRequest(AdminValidation.listUsers), AdminController.listUsers);
router.patch(
  '/users/:userId/status',
  validateRequest(AdminValidation.updateUserStatus),
  AdminController.updateUserStatus,
);

// ── Support tickets ───────────────────────────────────────────────────────────
router.get(
  '/support/tickets',
  validateRequest(AdminSupportValidation.listTickets),
  AdminSupportController.getTickets,
);
router.patch(
  '/support/tickets/:id',
  validateRequest(AdminSupportValidation.updateTicket),
  AdminSupportController.updateTicket,
);
router.post(
  '/support/tickets/:id/messages',
  validateRequest(AdminSupportValidation.addTicketMessage),
  AdminSupportController.addTicketMessage,
);

// ── Rides ─────────────────────────────────────────────────────────────────────
router.get('/rides', validateRequest(AdminRideValidation.list), AdminRideController.getRides);
router.patch(
  '/rides/:id/cancel',
  validateRequest(AdminRideValidation.cancel),
  AdminRideController.cancelRide,
);

// ── Notifications ─────────────────────────────────────────────────────────────
router.post(
  '/notifications/broadcast',
  validateRequest(AdminNotificationValidation.broadcast),
  AdminNotificationController.broadcast,
);

// ── Pricing rules ─────────────────────────────────────────────────────────────
router.get('/pricing', AdminPricingController.getPricingRules);
router.patch(
  '/pricing/:vehicleType',
  validateRequest(AdminPricingValidation.updateRule),
  AdminPricingController.updatePricingRule,
);

// ── Promotions ────────────────────────────────────────────────────────────────
router.get(
  '/promotions',
  validateRequest(AdminPromotionValidation.list),
  AdminPromotionController.getPromotions,
);
router.patch(
  '/promotions/:id',
  validateRequest(AdminPromotionValidation.update),
  AdminPromotionController.updatePromotion,
);

// ── Finances ──────────────────────────────────────────────────────────────────
router.get(
  '/finances/ledger',
  validateRequest(AdminFinanceValidation.ledger),
  AdminFinanceController.getLedger,
);

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get('/analytics/dashboard', AdminAnalyticsController.getDashboard);
router.get(
  '/analytics/trends',
  validateRequest(AdminAnalyticsValidation.trends),
  AdminAnalyticsController.getTrends,
);
router.get(
  '/analytics/export',
  validateRequest(AdminAnalyticsValidation.exportReport),
  AdminAnalyticsController.exportReport,
);

export default router;
