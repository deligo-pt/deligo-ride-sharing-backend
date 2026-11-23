import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { PromotionController } from './promotion.controller';
import { PromotionValidation } from './promotion.validation';

// Mounted at: /api/v1/promotions (see src/routes/index.ts)
const router: Router = Router();

// Create a promo code — ADMIN
router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  validateRequest(PromotionValidation.create),
  PromotionController.createPromoCode,
);

// Validate a promo code against an estimated fare — CUSTOMER.
// Declared before any future /:id routes to avoid param shadowing.
router.post(
  '/validate',
  authenticate,
  authorize('CUSTOMER'),
  validateRequest(PromotionValidation.validate),
  PromotionController.validatePromoCode,
);

export default router;
