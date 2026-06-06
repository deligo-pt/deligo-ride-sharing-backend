import { Request, Response, NextFunction } from 'express';
import { UpdateLocationSchema, SearchRideSchema } from './rides.validation';
import * as ridesService from './rides.service';
import { BadRequestError, ForbiddenError } from '../../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Rides Controllers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/rides/location
 *
 * Allows an authenticated DRIVER to broadcast their current coordinates to
 * Redis. The TTL on the geo-set means the entry auto-expires after 5 minutes
 * of inactivity, keeping the dataset fresh without manual cleanup.
 */
export async function updateLocation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    if (user.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can update their location.');
    }

    const parsed = UpdateLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    await ridesService.updateDriverLocation(user.id, parsed.data);

    res.status(200).json({
      success: true,
      data: { message: 'Location updated successfully.' },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/rides/search
 *
 * Allows an authenticated CUSTOMER to discover nearby, available, KYC-approved
 * drivers. Returns an empty array rather than a 404 when no drivers are found —
 * the client should handle the "no drivers nearby" UX gracefully.
 */
export async function searchRide(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    if (user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can search for rides.');
    }

    const parsed = SearchRideSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const drivers = await ridesService.findNearbyDrivers(parsed.data);

    res.status(200).json({
      success: true,
      data: drivers,
    });
  } catch (err) {
    next(err);
  }
}
