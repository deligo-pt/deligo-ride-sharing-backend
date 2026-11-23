import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { PricingController } from './pricing.controller';
import { PricingValidation } from './pricing.validation';

// Mounted at: /api/v1/admin/pricing (see src/routes/index.ts) — behind authenticate + authorize('ADMIN').
const router: Router = Router();

router.get('/', PricingController.getPricingRules);
router.patch(
  '/:vehicleType',
  validateRequest(PricingValidation.updateRule),
  PricingController.updatePricingRule,
);

export default router;
