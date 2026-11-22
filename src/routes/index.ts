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
import adminRouter from '../modules/admin/admin.route';
import userRouter from '../modules/user/user.route';

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
  { path: '/admin', route: adminRouter },
];

const router: Router = Router();

moduleRoutes.forEach(({ path, route, middlewares = [] }) => {
  router.use(path, ...middlewares, route);
});

export default router;
