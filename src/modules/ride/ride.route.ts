import { Router } from 'express';
import { RideController } from './ride.controller';
import { RideValidation } from './ride.validation';
import { validateRequest } from '../../middlewares/validateRequest';
import { authenticate, authorize } from '../../middlewares/auth';
import { rideRateLimiter } from '../../middlewares/rateLimiter';

const router: Router = Router();

router.get(
  '/',
  authenticate,
  authorize('CUSTOMER', 'DRIVER', 'ADMIN'),
  validateRequest(RideValidation.listRides),
  RideController.listRides,
);

router.patch(
  '/location',
  authenticate,
  authorize('DRIVER'),
  validateRequest(RideValidation.updateLocation),
  RideController.updateLocation,
);

router.post(
  '/search',
  authenticate,
  authorize('CUSTOMER'),
  validateRequest(RideValidation.searchRide),
  RideController.searchRide,
);

router.post(
  '/estimate',
  authenticate,
  authorize('CUSTOMER'),
  rideRateLimiter,
  validateRequest(RideValidation.estimateFare),
  RideController.estimateFare,
);

router.post(
  '/request',
  authenticate,
  authorize('CUSTOMER'),
  rideRateLimiter,
  validateRequest(RideValidation.requestRide),
  RideController.requestRide,
);

router.post(
  '/recurring',
  authenticate,
  authorize('CUSTOMER'),
  validateRequest(RideValidation.createRecurringProfile),
  RideController.createRecurringProfile,
);

router.get(
  '/recurring',
  authenticate,
  authorize('CUSTOMER'),
  RideController.getMyRecurringProfiles,
);

router.post(
  '/recurring/evaluate',
  authenticate,
  authorize('ADMIN'),
  RideController.triggerRecurringEvaluate,
);

router.delete(
  '/recurring/:id',
  authenticate,
  authorize('CUSTOMER'),
  RideController.deactivateRecurringProfile,
);

router.patch('/:id/accept', authenticate, authorize('DRIVER'), RideController.acceptRide);

router.patch(
  '/:id/status',
  authenticate,
  authorize('DRIVER'),
  validateRequest(RideValidation.updateRideStatus),
  RideController.updateRideStatus,
);

router.post(
  '/:id/cancel',
  authenticate,
  authorize('CUSTOMER', 'DRIVER'),
  validateRequest(RideValidation.cancelRide),
  RideController.cancelRide,
);

router.patch(
  '/:id/admin-cancel',
  authenticate,
  authorize('ADMIN'),
  validateRequest(RideValidation.adminCancelRide),
  RideController.adminCancelRide,
);

router.post('/:id/share', authenticate, authorize('CUSTOMER', 'DRIVER'), RideController.shareRide);

router.get(
  '/:id',
  authenticate,
  authorize('CUSTOMER', 'DRIVER', 'ADMIN'),
  validateRequest(RideValidation.getRide),
  RideController.getRide,
);

export default router;
