import { Request, Response, NextFunction } from 'express';
import { sendResponse } from '../../utils/sendResponse';
import { assertAdmin } from './admin.utils';
import { broadcastNotification } from './admin.notifications.service';

export const broadcastNotificationHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const result = await broadcastNotification(
      req.body as Parameters<typeof broadcastNotification>[0],
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Notification broadcast successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};
