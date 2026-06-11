import { Request, Response, NextFunction } from 'express';
import * as customersService from './customers.service';
import { UpdateProfileSchema, SavedLocationSchema } from './customers.validation';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Customers Controller — PRD 2.1
// ─────────────────────────────────────────────────────────────────────────────

/** Map service sentinel errors → typed HTTP errors */
function mapCustomerError(err: unknown): Error {
  if (err instanceof Error) {
    switch (err.message) {
      case 'USER_NOT_FOUND':
        return new NotFoundError('User');
      case 'LOCATION_NOT_FOUND':
        return new NotFoundError('SavedLocation');
      case 'LOCATION_FORBIDDEN':
        return new ForbiddenError('You do not own this saved location.');
    }
  }
  return err instanceof Error ? err : new Error(String(err));
}

// ── GET /api/v1/customers/me ──────────────────────────────────────────────────

/**
 * Returns the authenticated customer's full profile + saved locations.
 * Role: CUSTOMER
 */
export async function getMyProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can access this endpoint.');
    }

    const profile = await customersService.getMyProfile(req.user!.id);

    res.status(200).json({ success: true, data: profile });
  } catch (err) {
    next(mapCustomerError(err));
  }
}

// ── PATCH /api/v1/customers/me ────────────────────────────────────────────────

/**
 * Update firstName and/or lastName.
 * Role: CUSTOMER
 */
export async function updateMyProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can update their profile.');
    }

    const parsed = UpdateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const user = await customersService.updateMyProfile(req.user!.id, parsed.data);

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(mapCustomerError(err));
  }
}

// ── POST /api/v1/customers/me/avatar ─────────────────────────────────────────

/**
 * Upload a profile picture and persist the Cloudinary URL.
 * Expects multipart/form-data with field name "avatar".
 * Role: CUSTOMER
 */
export async function uploadAvatar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can upload a profile picture.');
    }

    const file = req.file;
    if (!file) {
      throw new BadRequestError('No file uploaded. Use multipart/form-data with field name "avatar".');
    }

    const result = await customersService.uploadAvatar(req.user!.id, file);

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(mapCustomerError(err));
  }
}

// ── POST /api/v1/customers/locations ─────────────────────────────────────────

/**
 * Create a saved location for the authenticated customer.
 * Role: CUSTOMER
 */
export async function createSavedLocation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can save locations.');
    }

    const parsed = SavedLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const location = await customersService.createSavedLocation(req.user!.id, parsed.data);

    res.status(201).json({ success: true, data: location });
  } catch (err) {
    next(mapCustomerError(err));
  }
}

// ── DELETE /api/v1/customers/locations/:id ────────────────────────────────────

/**
 * Soft-delete a saved location (ownership checked in service).
 * Role: CUSTOMER
 */
export async function deleteSavedLocation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can delete saved locations.');
    }

    const locationId = String(req.params.id);
    await customersService.deleteSavedLocation(req.user!.id, locationId);

    res.status(200).json({ success: true, data: { message: 'Saved location deleted successfully.' } });
  } catch (err) {
    next(mapCustomerError(err));
  }
}
