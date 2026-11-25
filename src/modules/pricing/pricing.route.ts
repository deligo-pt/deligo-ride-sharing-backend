import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { PricingController } from './pricing.controller';
import { PricingValidation } from './pricing.validation';

const router: Router = Router();

router.get('/', authenticate, authorize('ADMIN'), PricingController.getPricingRules);
router.patch(
  '/:vehicleType',
  authenticate,
  authorize('ADMIN'),
  validateRequest(PricingValidation.updateRule),
  PricingController.updatePricingRule,
);

export const pricingRouter = router;
