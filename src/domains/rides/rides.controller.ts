import { Request, Response, NextFunction } from 'express';
import {
  UpdateLocationSchema,
  SearchRideSchema,
  EstimateFareSchema,
  RequestRideSchema,
} from './rides.validation';
import * as ridesService from './rides.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Rides Controllers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/rides/location
 * Role: DRIVER
 */
export async function updateLocation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can update their location.');
    }

    const parsed = UpdateLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    await ridesService.updateDriverLocation(req.user!.id, parsed.data);

    res.status(200).json({ success: true, data: { message: 'Location updated successfully.' } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/rides/search
 * Role: CUSTOMER
 *
 * Discovers nearby, KYC-approved, available drivers within 5 km.
 */
export async function searchRide(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can search for rides.');
    }

    const parsed = SearchRideSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const drivers = await ridesService.findNearbyDrivers(parsed.data);

    res.status(200).json({ success: true, data: drivers });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/rides/estimate
 * Role: CUSTOMER
 *
 * Returns an array of fare estimates — one per vehicle tier — for a given
 * pickup → dropoff pair. Pure computation; no DB writes.
 */
export async function estimateFare(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can request fare estimates.');
    }

    const parsed = EstimateFareSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const estimates = ridesService.estimateFare(parsed.data);

    res.status(200).json({ success: true, data: estimates });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/rides/request
 * Role: CUSTOMER
 *
 * Creates a Ride record (status = REQUESTED) and dispatches it to nearby,
 * eligible drivers. Returns the created Ride + dispatched driver IDs so the
 * frontend/socket layer knows which drivers were pinged.
 */
export async function requestRide(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can request rides.');
    }

    const parsed = RequestRideSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const result = await ridesService.requestRide(req.user!.id, parsed.data);

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err instanceof Error && err.message === 'CUSTOMER_PROFILE_NOT_FOUND') {
      next(new NotFoundError('CustomerProfile for this user. Create a customer profile first.'));
      return;
    }
    next(err);
  }
}
