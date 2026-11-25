import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { VehicleController } from './vehicle.controller';
import { VehicleValidation } from './vehicle.validation';

const router: Router = Router();

router.post(
  '/',
  authenticate,
  authorize('DRIVER'),
  validateRequest(VehicleValidation.create),
  VehicleController.createVehicle,
);
router.get('/me', authenticate, authorize('DRIVER'), VehicleController.getMyVehicle);
router.patch(
  '/',
  authenticate,
  authorize('DRIVER'),
  validateRequest(VehicleValidation.update),
  VehicleController.updateMyVehicle,
);
router.post(
  '/photos',
  authenticate,
  authorize('DRIVER'),
  validateRequest(VehicleValidation.addPhotos),
  VehicleController.addVehiclePhotos,
);

router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  validateRequest(VehicleValidation.list),
  VehicleController.getAllVehicles,
);
router.patch(
  '/:id/review',
  authenticate,
  authorize('ADMIN'),
  validateRequest(VehicleValidation.review),
  VehicleController.reviewVehicle,
);

export default router;
