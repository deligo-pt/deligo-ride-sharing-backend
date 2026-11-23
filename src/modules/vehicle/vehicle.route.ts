import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { kycUpload } from '../../middlewares/uploadMiddleware';
import { validateRequest } from '../../middlewares/validateRequest';
import { VehicleController } from './vehicle.controller';
import { VehicleValidation } from './vehicle.validation';

// Mounted at: /api/v1/vehicles (see src/routes/index.ts)
const router: Router = Router();

// ─── Driver ───────────────────────────────────────────────────────────────────
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
  kycUpload.array('photos', 5),
  VehicleController.uploadVehiclePhotos,
);

// ─── Admin ────────────────────────────────────────────────────────────────────
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
