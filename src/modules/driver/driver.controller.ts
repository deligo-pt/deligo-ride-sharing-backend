import { DriverService } from './driver.service';
import { TripHistoryQuery } from './driver.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

const getMyDashboard = catchAsync(async (req, res) => {
  const profile = await DriverService.getDriverDashboard(req.user!.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Driver dashboard retrieved successfully',
    data: { profile },
  });
});

const getTripHistory = catchAsync(async (req, res) => {
  const result = await DriverService.getDriverTripHistory(
    req.user!.id,
    req.query as unknown as TripHistoryQuery,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Trip history retrieved successfully',
    data: result,
  });
});

export const DriverController = {
  getMyDashboard,
  getTripHistory,
};
