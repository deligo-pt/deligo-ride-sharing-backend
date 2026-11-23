import { PromotionService } from './promotion.service';
import {
  CreatePromoCodeDto,
  DeactivatePromotionInput,
  ListPromotionsQuery,
  ValidatePromoCodeDto,
} from './promotion.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

// ─────────────────────────────────────────────────────────────────────────────
// Promotions Controller
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/promotions
 * Role: ADMIN
 *
 * Creates a new promo code. The `code` value is uppercased by the Zod schema
 * transform before it reaches the database.
 */
const createPromoCode = catchAsync(async (req, res) => {
  const promoCode = await PromotionService.createPromoCode(req.body as CreatePromoCodeDto);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Promo code created successfully',
    data: { promoCode },
  });
});

/**
 * POST /api/v1/promotions/validate
 * Role: CUSTOMER
 *
 * Validates a promo code against the authenticated customer and an estimated
 * fare. Returns the hypothetical discount and adjusted fare. Does NOT record a
 * PromoUsage — that happens on ride COMPLETION.
 */
const validatePromoCode = catchAsync(async (req, res) => {
  const result = await PromotionService.validatePromoCode(
    req.user!.id,
    req.body as ValidatePromoCodeDto,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Promo code validated successfully',
    data: result,
  });
});

/** GET /api/v1/promotions — Role: ADMIN. Paginated list of all promo codes. */
const listPromotions = catchAsync(async (req, res) => {
  const { promotions, meta } = await PromotionService.listPromotions(
    req.query as unknown as ListPromotionsQuery,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Promotions retrieved successfully',
    meta,
    data: { promotions },
  });
});

/** PATCH /api/v1/promotions/:id — Role: ADMIN. Activate or deactivate a promo code. */
const updatePromotion = catchAsync(async (req, res) => {
  const updated = await PromotionService.updatePromotionStatus(
    req.params.id as string,
    req.body as DeactivatePromotionInput,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Promotion updated successfully',
    data: updated,
  });
});

export const PromotionController = {
  listPromotions,
  updatePromotion,
  createPromoCode,
  validatePromoCode,
};
