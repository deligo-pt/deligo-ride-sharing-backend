import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as promotionsController from './promotions.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Promotions Router
// Mounted at: /api/v1/promotions  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router: Router = Router();

/**
 * POST /api/v1/promotions
 * Create a new promo code.
 * Role: ADMIN
 */
router.post('/', authenticate, promotionsController.createPromoCodeHandler);

/**
 * POST /api/v1/promotions/validate
 * Validate a promo code against an estimated fare.
 * Role: CUSTOMER
 * Note: Must be declared before any future /:id routes to avoid param shadowing.
 */
router.post('/validate', authenticate, promotionsController.validatePromoCodeHandler);

export default router;
