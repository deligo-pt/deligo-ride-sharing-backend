import { NextFunction, Request, Response } from 'express';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { createReview, getMyReviews } from './reviews.service';
import { CreateReviewSchema } from './reviews.validation';
import { sendResponse } from '../../utils/sendResponse';

// ─────────────────────────────────────────────────────────────────────────────
// Reviews Controller
// ─────────────────────────────────────────────────────────────────────────────

/** Map domain sentinel strings → typed HTTP errors */
function mapError(err: unknown): unknown {
  if (err instanceof Error) {
    switch (err.message) {
      case 'RIDE_NOT_FOUND':
        return new NotFoundError('Ride');
      case 'RIDE_NOT_COMPLETED':
        return new BadRequestError('You can only review a COMPLETED ride.');
      case 'RIDE_FORBIDDEN':
        return new ForbiddenError('You were not a participant in this ride.');
      case 'DRIVER_NOT_ASSIGNED':
        return new BadRequestError('No driver was assigned to this ride.');
      case 'REVIEW_ALREADY_EXISTS':
        return new BadRequestError('You have already submitted a review for this ride.');
      case 'INVALID_ROLE':
        return new ForbiddenError('Only CUSTOMER and DRIVER roles can submit reviews.');
    }
  }
  return err;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/reviews
 * Role: CUSTOMER or DRIVER
 *
 * Creates a review for a completed ride. The reviewee is determined
 * automatically based on the caller's role.
 */
export async function submitReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = CreateReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const review = await createReview(req.user!.id, req.user!.role, parsed.data);

    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: 'Review submitted successfully',
      data: { review },
    });
  } catch (err) {
    next(mapError(err));
  }
}

/**
 * GET /api/v1/reviews/me
 * Role: any authenticated user
 *
 * Returns all reviews written ABOUT the logged-in user, newest first,
 * including the reviewer's name and the associated ride summary.
 */
export async function getReviewsAboutMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reviews = await getMyReviews(req.user!.id);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Reviews retrieved successfully',
      data: { reviews, total: reviews.length },
    });
  } catch (err) {
    next(err);
  }
}
