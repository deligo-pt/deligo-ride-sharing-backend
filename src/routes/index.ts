import { RequestHandler, Router } from 'express';
import authRouter from '../domains/auth/auth.routes';
import ridesRouter from '../domains/rides/rides.routes';
import driversRouter from '../domains/drivers/drivers.routes';
import vehicleRouter from '../domains/vehicle/vehicle.routes';
import profileRouter from '../domains/profile/profile.routes';
import kycRouter from '../domains/kyc/kyc.routes';
import notificationsRouter from '../domains/notifications/notifications.routes';
import promotionsRouter from '../domains/promotions/promotions.routes';
import reviewsRouter from '../domains/reviews/reviews.routes';
import supportRouter from '../domains/support/support.routes';
import safetyRouter from '../domains/safety/safety.routes';
import adminRouter from '../domains/admin/admin.routes';
import usersRouter from './users.routes';

interface ModuleRoute {
  path: string;
  route: Router;
  middlewares?: RequestHandler[];
}

const moduleRoutes: ModuleRoute[] = [
  { path: '/auth', route: authRouter },
  { path: '/rides', route: ridesRouter },
  { path: '/drivers', route: driversRouter },
  { path: '/vehicles', route: vehicleRouter },
  { path: '/profile', route: profileRouter },
  { path: '/kyc', route: kycRouter },
  { path: '/notifications', route: notificationsRouter },
  { path: '/promotions', route: promotionsRouter },
  { path: '/reviews', route: reviewsRouter },
  { path: '/support', route: supportRouter },
  { path: '/safety', route: safetyRouter },
  { path: '/users', route: usersRouter },
  { path: '/admin', route: adminRouter },
];

const router: Router = Router();

moduleRoutes.forEach(({ path, route, middlewares = [] }) => {
  router.use(path, ...middlewares, route);
});

export default router;
