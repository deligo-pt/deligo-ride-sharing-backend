import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { AdminPromotionController } from './admin-promotion.controller';
import { AdminPromotionValidation } from './admin-promotion.validation';

// Mounted at: /api/v1/admin/promotions (see src/routes/index.ts) — behind authenticate + authorize('ADMIN').
const router: Router = Router();

router.get(
  '/',
  validateRequest(AdminPromotionValidation.list),
  AdminPromotionController.getPromotions,
);
router.patch(
  '/:id',
  validateRequest(AdminPromotionValidation.update),
  AdminPromotionController.updatePromotion,
);

export default router;
