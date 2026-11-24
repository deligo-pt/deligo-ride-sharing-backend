import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { PromotionController } from './promotion.controller';
import { PromotionValidation } from './promotion.validation';

const router: Router = Router();

router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  validateRequest(PromotionValidation.create),
  PromotionController.createPromoCode,
);

router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  validateRequest(PromotionValidation.list),
  PromotionController.listPromotions,
);

router.post(
  '/validate',
  authenticate,
  authorize('CUSTOMER'),
  validateRequest(PromotionValidation.validate),
  PromotionController.validatePromoCode,
);

router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  validateRequest(PromotionValidation.update),
  PromotionController.updatePromotion,
);

export default router;
