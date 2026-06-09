import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../types/api.types';
import { assertAdmin } from './admin.utils';
import { listPromotions, updatePromotionStatus } from './admin.promotions.service';

export const getPromotionsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const { promotions, meta } = await listPromotions(req.query as never);
    res.status(200).json(successResponse({ promotions }, meta));
  } catch (err) {
    next(err);
  }
};

export const updatePromotionHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const promoId = req.params.id as string;
    const updated = await updatePromotionStatus(promoId, req.body);
    res.status(200).json(successResponse(updated));
  } catch (err) {
    next(err);
  }
};
