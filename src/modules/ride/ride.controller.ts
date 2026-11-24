import { RideService } from './ride.service';
import { RecurringService } from './recurring.service';
import {
  AdminCancelRideInput,
  CancelRideDto,
  EstimateFareDto,
  ListRidesQuery,
  RecurringProfileDto,
  RequestRideDto,
  SearchRideDto,
  UpdateLocationDto,
  UpdateRideStatusDto,
} from './ride.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

const listRides = catchAsync(async (req, res) => {
  const { rides, meta } = await RideService.listRides(
    { id: req.user!.id, role: req.user!.role },
    req.query as unknown as ListRidesQuery,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Rides retrieved successfully',
    meta,
    data: { rides },
  });
});

const getRide = catchAsync(async (req, res) => {
  const ride = await RideService.getRide(
    { id: req.user!.id, role: req.user!.role },
    String(req.params.id),
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Ride retrieved successfully',
    data: { ride },
  });
});

const updateLocation = catchAsync(async (req, res) => {
  await RideService.updateDriverLocation(req.user!.id, req.body as UpdateLocationDto);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Location updated successfully',
    data: { message: 'Location updated successfully.' },
  });
});

const searchRide = catchAsync(async (req, res) => {
  const drivers = await RideService.findNearbyDrivers(req.body as SearchRideDto);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Nearby drivers retrieved successfully',
    data: drivers,
  });
});

const estimateFare = catchAsync(async (req, res) => {
  const estimates = await RideService.estimateFare(req.user!.id, req.body as EstimateFareDto);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fare estimates retrieved successfully',
    data: estimates,
  });
});

const requestRide = catchAsync(async (req, res) => {
  const result = await RideService.requestRide(req.user!.id, req.body as RequestRideDto);

  if (result.scheduled) {
    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: 'Ride scheduled successfully',
      data: {
        ride: result.ride,
        scheduled: true,
        message: `Ride scheduled for ${result.ride.scheduledAt?.toISOString()}. Driver search will begin 30 minutes before pickup.`,
        dispatchedDriverIds: [],
      },
    });
    return;
  }

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Ride requested successfully',
    data: {
      ride: result.ride,
      scheduled: false,
      dispatchedDriverIds: result.dispatchedDriverIds,
    },
  });
});

const acceptRide = catchAsync(async (req, res) => {
  const ride = await RideService.acceptRide(req.user!.id, String(req.params.id));

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Ride accepted successfully',
    data: { ride },
  });
});

const updateRideStatus = catchAsync(async (req, res) => {
  const result = await RideService.updateRideStatus(
    req.user!.id,
    String(req.params.id),
    req.body as UpdateRideStatusDto,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Ride status updated successfully',
    data: result,
  });
});

const cancelRide = catchAsync(async (req, res) => {
  const ride = await RideService.cancelRide(
    req.user!.id,
    String(req.params.id),
    req.body as CancelRideDto,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Ride cancelled successfully',
    data: { ride },
  });
});

const shareRide = catchAsync(async (req, res) => {
  const result = await RideService.shareRide(req.user!.id, String(req.params.id));

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Ride shared successfully',
    data: result,
  });
});

const createRecurringProfile = catchAsync(async (req, res) => {
  const profile = await RecurringService.createRecurringProfile(
    req.user!.id,
    req.body as RecurringProfileDto,
  );

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Recurring ride profile created successfully',
    data: { profile },
  });
});

const getMyRecurringProfiles = catchAsync(async (req, res) => {
  const profiles = await RecurringService.getMyRecurringProfiles(req.user!.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Recurring ride profiles retrieved successfully',
    data: { profiles, total: profiles.length },
  });
});

const deactivateRecurringProfile = catchAsync(async (req, res) => {
  const profile = await RecurringService.deactivateRecurringProfile(
    req.user!.id,
    String(req.params.id),
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Recurring ride profile deactivated successfully',
    data: { profile },
  });
});

const triggerRecurringEvaluate = catchAsync(async (_req, res) => {
  const result = await RecurringService.evaluateRecurringProfiles();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Recurring rides evaluated successfully',
    data: result,
  });
});

const adminCancelRide = catchAsync(async (req, res) => {
  const result = await RideService.cancelRideByAdmin(
    String(req.params.id),
    req.body as AdminCancelRideInput,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Ride cancelled successfully',
    data: result,
  });
});

export const RideController = {
  adminCancelRide,
  listRides,
  getRide,
  updateLocation,
  searchRide,
  estimateFare,
  requestRide,
  acceptRide,
  updateRideStatus,
  cancelRide,
  shareRide,
  createRecurringProfile,
  getMyRecurringProfiles,
  deactivateRecurringProfile,
  triggerRecurringEvaluate,
};
