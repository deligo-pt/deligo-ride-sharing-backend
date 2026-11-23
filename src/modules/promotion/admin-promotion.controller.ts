import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { AdminPromotionService } from './admin-promotion.service';
import { DeactivatePromotionInput, ListPromotionsQuery } from './admin-promotion.validation';

/** GET /api/v1/admin/promotions */
const getPromotions = catchAsync(async (req, res) => {
  const { promotions, meta } = await AdminPromotionService.listPromotions(
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

/** PATCH /api/v1/admin/promotions/:id */
const updatePromotion = catchAsync(async (req, res) => {
  const updated = await AdminPromotionService.updatePromotionStatus(
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

export const AdminPromotionController = {
  getPromotions,
  updatePromotion,
};
