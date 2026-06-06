import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { VehicleClass, VehicleType } from '@prisma/client';
import * as rideService from './ride.service';
import { NotFoundError, BadRequestError } from '../../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Validation Schema
// ─────────────────────────────────────────────────────────────────────────────

const RequestRideSchema = z.object({
  pickupAddress: z.string().min(1, 'Pickup address is required'),
  pickupLatitude: z.number(),
  pickupLongitude: z.number(),

  dropoffAddress: z.string().min(1, 'Dropoff address is required'),
  dropoffLatitude: z.number(),
  dropoffLongitude: z.number(),

  estimatedFare: z.number().positive('Estimated fare must be a positive number'),

  vehicleClass: z.nativeEnum(VehicleClass).optional(),
  vehicleType: z.nativeEnum(VehicleType).optional(),
  promoCode: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Controllers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/rides/request
 *
 * Protected by requireAuth middleware. Creates a ride request for the
 * currently authenticated rider identified by req.user.id.
 */
export async function requestRide(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // req.user is guaranteed by requireAuth middleware
    const userId = req.user!.id;

    const parsed = RequestRideSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten());
    }

    const ride = await rideService.requestRide({
      riderUserId: userId,
      ...parsed.data,
    });

    res.status(201).json({
      success: true,
      data: { ride },
    });
  } catch (err) {
    // Map service-layer sentinel errors to HTTP errors
    if (err instanceof Error && err.message === 'CUSTOMER_PROFILE_NOT_FOUND') {
      next(
        new NotFoundError(
          'CustomerProfile for this user. Create a customer profile first.',
        ),
      );
      return;
    }
    next(err);
  }
}
