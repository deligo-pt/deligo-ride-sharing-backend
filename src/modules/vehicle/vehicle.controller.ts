import { VehicleService } from './vehicle.service';
import {
  CreateVehicleInput,
  ListVehiclesQuery,
  ReviewVehicleInput,
  UpdateVehicleInput,
} from './vehicle.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { BadRequestError } from '../../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle Controller
// Role checks live in vehicle.route.ts (authorize); validation in vehicle.validation.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/v1/vehicles — driver registers a vehicle. */
const createVehicle = catchAsync(async (req, res) => {
  const vehicle = await VehicleService.createVehicle(req.user!.id, req.body as CreateVehicleInput);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Vehicle created successfully',
    data: vehicle,
  });
});

/** GET /api/v1/vehicles/me — driver's own vehicle with approval status. */
const getMyVehicle = catchAsync(async (req, res) => {
  const vehicle = await VehicleService.getMyVehicle(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Vehicle retrieved successfully',
    data: vehicle,
  });
});

/** GET /api/v1/vehicles — admin lists all vehicles (?status=PENDING_REVIEW). */
const getAllVehicles = catchAsync(async (req, res) => {
  const { status } = req.query as ListVehiclesQuery;
  const vehicles = await VehicleService.getAllVehicles(status);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Vehicles retrieved successfully',
    data: vehicles,
  });
});

/** PATCH /api/v1/vehicles — driver updates vehicle info (resets to PENDING_REVIEW). */
const updateMyVehicle = catchAsync(async (req, res) => {
  const vehicle = await VehicleService.updateMyVehicle(
    req.user!.id,
    req.body as UpdateVehicleInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Vehicle updated successfully',
    data: vehicle,
  });
});

/** POST /api/v1/vehicles/photos — driver uploads up to 5 photos. */
const uploadVehiclePhotos = catchAsync(async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;

  if (!files || files.length === 0) {
    throw new BadRequestError('Please attach at least one photo.', undefined, 'NO_FILES');
  }

  const vehicle = await VehicleService.uploadVehiclePhotos(req.user!.id, files);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Vehicle photos uploaded successfully',
    data: vehicle,
  });
});

/** PATCH /api/v1/vehicles/:id/review — admin approves / rejects / suspends. */
const reviewVehicle = catchAsync(async (req, res) => {
  const vehicle = await VehicleService.reviewVehicle(
    req.params.id as string,
    req.body as ReviewVehicleInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Vehicle reviewed successfully',
    data: vehicle,
  });
});

export const VehicleController = {
  createVehicle,
  getMyVehicle,
  getAllVehicles,
  updateMyVehicle,
  uploadVehiclePhotos,
  reviewVehicle,
};
