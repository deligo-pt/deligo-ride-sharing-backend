import { NextFunction, Request, Response } from 'express';
import {
  createVehicle,
  getMyVehicle,
  getAllVehicles,
  updateMyVehicle,
  uploadVehiclePhotos,
  reviewVehicle,
} from './vehicle.service';
import {
  createVehicleSchema,
  updateVehicleSchema,
  reviewVehicleSchema,
} from './vehicle.validation';
import { sendResponse } from '../../utils/sendResponse';
import { BadRequestError, ForbiddenError, toAppError } from '../../utils/errors';

// ─── POST /api/v1/vehicles ────────────────────────────────────────────────────

export const handleCreateVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user!.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can register a vehicle.');
    }

    const validated = createVehicleSchema.parse({ body: req.body as unknown }).body;
    const vehicle = await createVehicle(req.user!.id, validated);
    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: 'Vehicle created successfully',
      data: vehicle,
    });
  } catch (error: unknown) {
    next(
      toAppError(error, {
        statusCode: 400,
        code: 'VEHICLE_CREATION_FAILED',
        message: 'Failed to create vehicle.',
      }),
    );
  }
};

// ─── GET /api/v1/vehicles/me ──────────────────────────────────────────────────

export const handleGetMyVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user!.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can access this endpoint.');
    }
    const vehicle = await getMyVehicle(req.user!.id);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Vehicle retrieved successfully',
      data: vehicle,
    });
  } catch (error: unknown) {
    next(
      toAppError(error, {
        statusCode: 404,
        code: 'VEHICLE_NOT_FOUND',
        message: 'Vehicle not found.',
      }),
    );
  }
};

// ─── GET /api/v1/vehicles (ADMIN) ─────────────────────────────────────────────

export const handleGetAllVehicles = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can list all vehicles.');
    }
    const statusFilter = req.query.status as string | undefined;
    const vehicles = await getAllVehicles(statusFilter);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Vehicles retrieved successfully',
      data: vehicles,
    });
  } catch (error: unknown) {
    next(
      toAppError(error, {
        statusCode: 500,
        code: 'FETCH_FAILED',
        message: 'Failed to fetch vehicles.',
      }),
    );
  }
};

// ─── PATCH /api/v1/vehicles ───────────────────────────────────────────────────

export const handleUpdateMyVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user!.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can update their vehicle.');
    }
    const validated = updateVehicleSchema.parse({ body: req.body as unknown }).body;
    const vehicle = await updateMyVehicle(req.user!.id, validated);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Vehicle updated successfully',
      data: vehicle,
    });
  } catch (error: unknown) {
    next(
      toAppError(error, {
        statusCode: 400,
        code: 'VEHICLE_UPDATE_FAILED',
        message: 'Failed to update vehicle.',
      }),
    );
  }
};

// ─── POST /api/v1/vehicles/photos ─────────────────────────────────────────────

export const handleUploadVehiclePhotos = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user!.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can upload vehicle photos.');
    }

    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      throw new BadRequestError('Please attach at least one photo.', undefined, 'NO_FILES');
    }

    const vehicle = await uploadVehiclePhotos(req.user!.id, files);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Vehicle photos uploaded successfully',
      data: vehicle,
    });
  } catch (error: unknown) {
    next(
      toAppError(error, {
        statusCode: 400,
        code: 'PHOTO_UPLOAD_FAILED',
        message: 'Failed to upload photos.',
      }),
    );
  }
};

// ─── PATCH /api/v1/vehicles/:id/review (ADMIN) ────────────────────────────────

export const handleReviewVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can review vehicles.');
    }
    const vehicleId = req.params.id as string;
    const validated = reviewVehicleSchema.parse({ body: req.body as unknown }).body;
    const vehicle = await reviewVehicle(vehicleId, validated);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Vehicle reviewed successfully',
      data: vehicle,
    });
  } catch (error: unknown) {
    next(
      toAppError(error, {
        statusCode: 400,
        code: 'REVIEW_FAILED',
        message: 'Failed to review vehicle.',
      }),
    );
  }
};
