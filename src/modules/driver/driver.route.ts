import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { DriverController } from './driver.controller';
import { DriverValidation } from './driver.validation';

const router: Router = Router();

router.get('/me', authenticate, authorize('DRIVER'), DriverController.getMyDashboard);

router.get(
  '/me/history',
  authenticate,
  authorize('DRIVER'),
  validateRequest(DriverValidation.tripHistory),
  DriverController.getTripHistory,
);

export const driverRouter = router;
