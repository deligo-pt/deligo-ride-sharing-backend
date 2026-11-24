import { PromotionService } from './promotion.service';
import {
  CreatePromoCodeDto,
  DeactivatePromotionInput,
  ListPromotionsQuery,
  ValidatePromoCodeDto,
} from './promotion.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

const createPromoCode = catchAsync(async (req, res) => {
  const promoCode = await PromotionService.createPromoCode(req.body as CreatePromoCodeDto);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Promo code created successfully',
    data: { promoCode },
  });
});

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
