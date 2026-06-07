import { Request, Response, NextFunction } from 'express';
import {
  UpdateLocationSchema,
  SearchRideSchema,
  EstimateFareSchema,
  RequestRideSchema,
  UpdateRideStatusSchema,
  CancelRideSchema,
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

    const estimates = await ridesService.estimateFare(parsed.data);

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

// ─── Sentinel → HTTP error helper ─────────────────────────────────────────────
function mapRideError(err: unknown): Error {
  if (err instanceof Error) {
    switch (err.message) {
      case 'RIDE_NOT_FOUND':          return new NotFoundError('Ride');
      case 'RIDE_NOT_AVAILABLE':      return new BadRequestError('Ride is no longer available for acceptance.');
      case 'DRIVER_PROFILE_NOT_FOUND': return new NotFoundError('DriverProfile for this user. Complete driver onboarding first.');
      case 'RIDE_FORBIDDEN':          return new ForbiddenError('You are not the assigned driver for this ride.');
      case 'RIDE_ALREADY_TERMINAL':   return new BadRequestError('Ride is already completed or cancelled.');
    }
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * PATCH /api/v1/rides/:id/accept
 * Role: DRIVER
 *
 * Atomically claims the ride and marks the driver unavailable.
 */
export async function acceptRide(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can accept rides.');
    }

    const rideId = String(req.params.id);
    const ride = await ridesService.acceptRide(req.user!.id, rideId);

    res.status(200).json({ success: true, data: { ride } });
  } catch (err) {
    next(mapRideError(err));
  }
}

/**
 * PATCH /api/v1/rides/:id/status
 * Role: DRIVER
 *
 * Advances the trip status to DRIVER_ARRIVED, IN_PROGRESS, or COMPLETED.
 * On COMPLETED: releases the driver back to the pool and increments ride counts.
 */
export async function updateRideStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can update ride status.');
    }

    const parsed = UpdateRideStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const rideId = String(req.params.id);
    const result = await ridesService.updateRideStatus(req.user!.id, rideId, parsed.data);

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(mapRideError(err));
  }
}

/**
 * POST /api/v1/rides/:id/cancel
 * Role: CUSTOMER or DRIVER
 *
 * Cancels the ride and releases the assigned driver (if any) back to the pool.
 */
export async function cancelRide(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const role = req.user!.role;
    if (role !== 'CUSTOMER' && role !== 'DRIVER') {
      throw new ForbiddenError('Only customers or drivers can cancel a ride.');
    }

    const parsed = CancelRideSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const rideId = String(req.params.id);
    const ride = await ridesService.cancelRide(rideId, parsed.data);

    res.status(200).json({ success: true, data: { ride } });
  } catch (err) {
    next(mapRideError(err));
  }
}

/**
 * POST /api/v1/rides/:id/share
 * Role: CUSTOMER
 *
 * Generates a 24-hour tracking token stored in Redis and returns a public
 * tracking URL the customer can share with friends/family. A guest can use
 * the token to join the Socket.io room in read-only mode.
 */
export async function shareRide(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can share their ride.');
    }

    const rideId = String(req.params.id);
    const result = await ridesService.shareRide(req.user!.id, rideId);

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(mapRideError(err));
  }
}
