import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { AdminRideController } from './admin-ride.controller';
import { AdminRideValidation } from './admin-ride.validation';

// Mounted at: /api/v1/admin/rides (see src/routes/index.ts) — behind authenticate + authorize('ADMIN').
const router: Router = Router();

router.get('/', validateRequest(AdminRideValidation.list), AdminRideController.getRides);
router.patch(
  '/:id/cancel',
  validateRequest(AdminRideValidation.cancel),
  AdminRideController.cancelRide,
);

export default router;
