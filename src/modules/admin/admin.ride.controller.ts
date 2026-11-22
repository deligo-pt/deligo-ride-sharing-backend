import { Request, Response, NextFunction } from 'express';
import { sendResponse } from '../../utils/sendResponse';
import { assertAdmin } from './admin.util';
import { listRides, cancelRideByAdmin } from './admin.ride.service';

export const getRidesHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const { rides, meta } = await listRides(req.query as never);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Rides retrieved successfully',
      meta,
      data: { rides },
    });
  } catch (err) {
    next(err);
  }
};

export const cancelRideHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const rideId = req.params.id as string;
    const result = await cancelRideByAdmin(
      rideId,
      req.body as Parameters<typeof cancelRideByAdmin>[1],
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Ride cancelled successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};
