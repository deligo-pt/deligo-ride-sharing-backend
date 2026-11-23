import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { AdminRideService } from './admin.ride.service';
import { CancelRideInput, ListRidesQuery } from './admin.ride.validation';

/** GET /api/v1/admin/rides */
const getRides = catchAsync(async (req, res) => {
  const { rides, meta } = await AdminRideService.listRides(req.query as unknown as ListRidesQuery);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Rides retrieved successfully',
    meta,
    data: { rides },
  });
});

/** PATCH /api/v1/admin/rides/:id/cancel */
const cancelRide = catchAsync(async (req, res) => {
  const result = await AdminRideService.cancelRideByAdmin(
    req.params.id as string,
    req.body as CancelRideInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Ride cancelled successfully',
    data: result,
  });
});

export const AdminRideController = {
  getRides,
  cancelRide,
};
