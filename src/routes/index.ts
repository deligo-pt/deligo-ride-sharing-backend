import { RequestHandler, Router } from 'express';
import authRouter from '../modules/auth/auth.route';
import userRouter from '../modules/user/user.route';
import profileRouter from '../modules/profile/profile.route';
import driverRouter from '../modules/driver/driver.route';
import fleetRouter from '../modules/fleet/fleet.route';
import kycRouter from '../modules/kyc/kyc.route';
import vehicleRouter from '../modules/vehicle/vehicle.route';
import rideRouter from '../modules/ride/ride.route';
import promotionRouter from '../modules/promotion/promotion.route';
import reviewRouter from '../modules/review/review.route';
import supportRouter from '../modules/support/support.route';
import safetyRouter from '../modules/safety/safety.route';
import notificationRouter from '../modules/notification/notification.route';
import analyticsRouter from '../modules/analytics/analytics.route';
import financeRouter from '../modules/finance/finance.route';
import pricingRouter from '../modules/pricing/pricing.route';

interface ModuleRoute {
  path: string;
  route: Router;
  middlewares?: RequestHandler[];
}

// Every module is mounted ONCE at its resource prefix. Access control lives on the
// routes themselves (authenticate + authorize(...)) inside each <module>.route.ts.
const moduleRoutes: ModuleRoute[] = [
  { path: '/auth', route: authRouter },
  { path: '/users', route: userRouter },
  { path: '/profile', route: profileRouter },
  { path: '/drivers', route: driverRouter },
  { path: '/fleet', route: fleetRouter },
  { path: '/kyc', route: kycRouter },
  { path: '/vehicles', route: vehicleRouter },
  { path: '/rides', route: rideRouter },
  { path: '/promotions', route: promotionRouter },
  { path: '/reviews', route: reviewRouter },
  { path: '/support', route: supportRouter },
  { path: '/safety', route: safetyRouter },
  { path: '/notifications', route: notificationRouter },
  { path: '/analytics', route: analyticsRouter },
  { path: '/finances', route: financeRouter },
  { path: '/pricing', route: pricingRouter },
];

const router: Router = Router();

moduleRoutes.forEach(({ path, route, middlewares = [] }) => {
  router.use(path, ...middlewares, route);
});

export default router;
