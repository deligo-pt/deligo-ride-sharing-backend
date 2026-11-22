import { NextFunction, Request, Response } from 'express';
import {
  BadRequestError,
  ForbiddenError,
  ValidationError,
} from '../../utils/errors';
import { createPromoCode, validatePromoCode } from './promotions.service';
import {
  CreatePromoCodeSchema,
  ValidatePromoCodeSchema,
} from './promotions.validation';
import { sendResponse } from '../../utils/sendResponse';

// ─────────────────────────────────────────────────────────────────────────────
// Promotions Controller
// ─────────────────────────────────────────────────────────────────────────────

/** Map service sentinel strings → typed HTTP errors */
function mapError(err: unknown): unknown {
  if (err instanceof Error) {
    switch (err.message) {
      case 'PROMO_NOT_FOUND':
        return new BadRequestError('Invalid or inactive promo code');
      case 'PROMO_EXPIRED':
        return new BadRequestError('This promo code has expired');
      case 'PROMO_LIMIT_REACHED':
        return new BadRequestError('This promo code has reached its usage limit');
      case 'PROMO_MIN_FARE_NOT_MET':
        return new BadRequestError(
          'Your estimated fare does not meet the minimum required for this promo code',
        );
      case 'PROMO_ALREADY_USED':
        return new BadRequestError('You have already used this promo code');
    }
  }
  return err;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/promotions
 * Role: ADMIN
 *
 * Creates a new promo code. The `code` value is automatically uppercased by
 * the Zod schema transform before reaching the database.
 */
export async function createPromoCodeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Role guard
    if (req.user!.role !== 'ADMIN') {
      throw new ForbiddenError('Only ADMIN users can create promo codes');
    }

    const parsed = CreatePromoCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const promoCode = await createPromoCode(parsed.data);

    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: 'Promo code created successfully',
      data: { promoCode },
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/promotions/validate
 * Role: CUSTOMER
 *
 * Validates a promo code against the authenticated customer and a given
 * estimated fare. Returns the hypothetical discount and adjusted fare.
 * Does NOT yet record a PromoUsage — that happens on ride COMPLETION.
 */
export async function validatePromoCodeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Role guard
    if (req.user!.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only CUSTOMER users can validate promo codes');
    }

    const parsed = ValidatePromoCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const result = await validatePromoCode(req.user!.id, parsed.data);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Promo code validated successfully',
      data: result,
    });
  } catch (err) {
    next(mapError(err));
  }
}
