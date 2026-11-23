import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { PricingController } from './pricing.controller';
import { PricingValidation } from './pricing.validation';

// Mounted at: /api/v1/pricing (see src/routes/index.ts) — every route is ADMIN only.
const router: Router = Router();

router.get('/', authenticate, authorize('ADMIN'), PricingController.getPricingRules);
router.patch(
  '/:vehicleType',
  authenticate,
  authorize('ADMIN'),
  validateRequest(PricingValidation.updateRule),
  PricingController.updatePricingRule,
);

export default router;
