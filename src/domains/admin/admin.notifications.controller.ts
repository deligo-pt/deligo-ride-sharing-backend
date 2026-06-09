import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../types/api.types';
import { assertAdmin } from './admin.utils';
import { broadcastNotification } from './admin.notifications.service';

export const broadcastNotificationHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const result = await broadcastNotification(req.body);
    res.status(200).json(successResponse(result));
  } catch (err) {
    next(err);
  }
};
