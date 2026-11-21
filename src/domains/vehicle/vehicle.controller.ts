import { Request, Response } from 'express';
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

// ─── POST /api/v1/vehicles ────────────────────────────────────────────────────

export const handleCreateVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'DRIVER') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only drivers can register a vehicle.' },
      });
      return;
    }

    const validated = createVehicleSchema.parse({ body: req.body }).body;
    const vehicle = await createVehicle(req.user!.id, validated);
    res.status(201).json({ success: true, data: vehicle });
  } catch (error: unknown) {
    const err = error as { name?: string; errors?: { message: string }[]; message?: string };
    if (err.name === 'ZodError') {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors?.[0]?.message ?? 'Validation failed',
        },
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'VEHICLE_CREATION_FAILED',
        message: err.message ?? 'Failed to create vehicle.',
      },
    });
  }
};

// ─── GET /api/v1/vehicles/me ──────────────────────────────────────────────────

export const handleGetMyVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'DRIVER') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only drivers can access this endpoint.' },
      });
      return;
    }
    const vehicle = await getMyVehicle(req.user!.id);
    res.status(200).json({ success: true, data: vehicle });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(404).json({
      success: false,
      error: { code: 'VEHICLE_NOT_FOUND', message: err.message ?? 'Vehicle not found.' },
    });
  }
};

// ─── GET /api/v1/vehicles (ADMIN) ─────────────────────────────────────────────

export const handleGetAllVehicles = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admins can list all vehicles.' },
      });
      return;
    }
    const statusFilter = req.query.status as string | undefined;
    const vehicles = await getAllVehicles(statusFilter);
    res.status(200).json({ success: true, data: vehicles });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: err.message ?? 'Failed to fetch vehicles.' },
    });
  }
};

// ─── PATCH /api/v1/vehicles ───────────────────────────────────────────────────

export const handleUpdateMyVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'DRIVER') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only drivers can update their vehicle.' },
      });
      return;
    }
    const validated = updateVehicleSchema.parse({ body: req.body }).body;
    const vehicle = await updateMyVehicle(req.user!.id, validated);
    res.status(200).json({ success: true, data: vehicle });
  } catch (error: unknown) {
    const err = error as { name?: string; errors?: { message: string }[]; message?: string };
    if (err.name === 'ZodError') {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors?.[0]?.message ?? 'Validation failed',
        },
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'VEHICLE_UPDATE_FAILED',
        message: err.message ?? 'Failed to update vehicle.',
      },
    });
  }
};

// ─── POST /api/v1/vehicles/photos ─────────────────────────────────────────────

export const handleUploadVehiclePhotos = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'DRIVER') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only drivers can upload vehicle photos.' },
      });
      return;
    }

    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_FILES', message: 'Please attach at least one photo.' },
      });
      return;
    }

    const vehicle = await uploadVehiclePhotos(req.user!.id, files);
    res.status(200).json({ success: true, data: vehicle });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(400).json({
      success: false,
      error: { code: 'PHOTO_UPLOAD_FAILED', message: err.message ?? 'Failed to upload photos.' },
    });
  }
};

// ─── PATCH /api/v1/vehicles/:id/review (ADMIN) ────────────────────────────────

export const handleReviewVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admins can review vehicles.' },
      });
      return;
    }
    const vehicleId = req.params.id as string;
    const validated = reviewVehicleSchema.parse({ body: req.body }).body;
    const vehicle = await reviewVehicle(vehicleId, validated);
    res.status(200).json({ success: true, data: vehicle });
  } catch (error: unknown) {
    const err = error as { name?: string; errors?: { message: string }[]; message?: string };
    if (err.name === 'ZodError') {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors?.[0]?.message ?? 'Validation failed',
        },
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: { code: 'REVIEW_FAILED', message: err.message ?? 'Failed to review vehicle.' },
    });
  }
};
