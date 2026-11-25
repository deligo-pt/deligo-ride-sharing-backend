import { VehicleService } from './vehicle.service';
import {
  AddVehiclePhotosInput,
  CreateVehicleInput,
  ListVehiclesQuery,
  ReviewVehicleInput,
  UpdateVehicleInput,
} from './vehicle.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

const createVehicle = catchAsync(async (req, res) => {
  const vehicle = await VehicleService.createVehicle(req.user!.id, req.body as CreateVehicleInput);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Vehicle created successfully',
    data: vehicle,
  });
});

const getMyVehicle = catchAsync(async (req, res) => {
  const vehicle = await VehicleService.getMyVehicle(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Vehicle retrieved successfully',
    data: vehicle,
  });
});

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

const addVehiclePhotos = catchAsync(async (req, res) => {
  const { photos } = req.body as AddVehiclePhotosInput;

  const vehicle = await VehicleService.addVehiclePhotos(req.user!.id, photos);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Vehicle photos saved successfully',
    data: vehicle,
  });
});

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
  addVehiclePhotos,
  reviewVehicle,
};
