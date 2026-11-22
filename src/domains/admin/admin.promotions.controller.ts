import { Request, Response, NextFunction } from 'express';
import { sendResponse } from '../../utils/sendResponse';
import { assertAdmin } from './admin.utils';
import { listPromotions, updatePromotionStatus } from './admin.promotions.service';

export const getPromotionsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const { promotions, meta } = await listPromotions(req.query as never);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Promotions retrieved successfully',
      meta,
      data: { promotions },
    });
  } catch (err) {
    next(err);
  }
};

export const updatePromotionHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const promoId = req.params.id as string;
    const updated = await updatePromotionStatus(
      promoId,
      req.body as Parameters<typeof updatePromotionStatus>[1],
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Promotion updated successfully',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};
