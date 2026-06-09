import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../types/api.types';
import { assertAdmin } from './admin.utils';
import { listRides, cancelRideByAdmin } from './admin.rides.service';

export const getRidesHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const { rides, meta } = await listRides(req.query as never);
    res.status(200).json(successResponse({ rides }, meta));
  } catch (err) {
    next(err);
  }
};

export const cancelRideHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const rideId = req.params.id as string;
    const result = await cancelRideByAdmin(rideId, req.body);
    res.status(200).json(successResponse(result));
  } catch (err) {
    next(err);
  }
};
