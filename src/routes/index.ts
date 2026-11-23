import { RequestHandler, Router } from 'express';
import authRouter from '../modules/auth/auth.route';
import rideRouter from '../modules/ride/ride.route';
import driverRouter from '../modules/driver/driver.route';
import vehicleRouter from '../modules/vehicle/vehicle.route';
import profileRouter from '../modules/profile/profile.route';
import kycRouter from '../modules/kyc/kyc.route';
import notificationRouter from '../modules/notification/notification.route';
import promotionRouter from '../modules/promotion/promotion.route';
import reviewRouter from '../modules/review/review.route';
import supportRouter from '../modules/support/support.route';
import safetyRouter from '../modules/safety/safety.route';
import userRouter from '../modules/user/user.route';
import fleetOnboardingRouter from '../modules/fleet/fleet-onboarding.route';
import adminUserRouter from '../modules/user/admin-user.route';
import adminRideRouter from '../modules/ride/admin-ride.route';
import adminPromotionRouter from '../modules/promotion/admin-promotion.route';
import adminSupportRouter from '../modules/support/admin-support.route';
import adminNotificationRouter from '../modules/notification/admin-notification.route';
import analyticsRouter from '../modules/analytics/analytics.route';
import financeRouter from '../modules/finance/finance.route';
import pricingRouter from '../modules/pricing/pricing.route';
import { authenticate, authorize } from '../middlewares/auth';

interface ModuleRoute {
  path: string;
  route: Router;
  middlewares?: RequestHandler[];
}

const moduleRoutes: ModuleRoute[] = [
  { path: '/auth', route: authRouter },
  { path: '/rides', route: rideRouter },
  { path: '/drivers', route: driverRouter },
  { path: '/vehicles', route: vehicleRouter },
  { path: '/profile', route: profileRouter },
  { path: '/kyc', route: kycRouter },
  { path: '/notifications', route: notificationRouter },
  { path: '/promotions', route: promotionRouter },
  { path: '/reviews', route: reviewRouter },
  { path: '/support', route: supportRouter },
  { path: '/safety', route: safetyRouter },
  { path: '/users', route: userRouter },
  { path: '/fleet/onboarding', route: fleetOnboardingRouter },
];

/**
 * Admin back-office routes. Every URL stays under /api/v1/admin/... and is
 * protected by ONE shared guard (authenticate + authorize('ADMIN')), applied to
 * the whole /admin prefix — including unknown /admin/* paths — before any
 * admin router runs.
 */
const adminRoutes: ModuleRoute[] = [
  { path: '', route: adminUserRouter }, // /admin/users, /admin/kyc
  { path: '/rides', route: adminRideRouter },
  { path: '/promotions', route: adminPromotionRouter },
  { path: '/support', route: adminSupportRouter }, // /admin/support/tickets...
  { path: '/notifications', route: adminNotificationRouter },
  { path: '/analytics', route: analyticsRouter },
  { path: '/finances', route: financeRouter },
  { path: '/pricing', route: pricingRouter },
];

const router: Router = Router();

moduleRoutes.forEach(({ path, route, middlewares = [] }) => {
  router.use(path, ...middlewares, route);
});

router.use('/admin', authenticate, authorize('ADMIN'));
adminRoutes.forEach(({ path, route }) => {
  router.use(`/admin${path}`, route);
});

export default router;
