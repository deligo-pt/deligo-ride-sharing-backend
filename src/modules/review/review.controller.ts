import { ReviewService } from './review.service';
import { CreateReviewDto } from './review.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

// ─────────────────────────────────────────────────────────────────────────────
// Reviews Controller
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/reviews
 * Role: CUSTOMER or DRIVER
 *
 * Creates a review for a completed ride. The reviewee is determined
 * automatically based on the caller's role.
 */
const submitReview = catchAsync(async (req, res) => {
  const review = await ReviewService.createReview(
    req.user!.id,
    req.user!.role,
    req.body as CreateReviewDto,
  );

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Review submitted successfully',
    data: { review },
  });
});

/**
 * GET /api/v1/reviews/me
 * Role: any authenticated user
 *
 * Reviews written ABOUT the logged-in user, newest first, including the
 * reviewer's name and the associated ride summary.
 */
const getReviewsAboutMe = catchAsync(async (req, res) => {
  const reviews = await ReviewService.getMyReviews(req.user!.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Reviews retrieved successfully',
    data: { reviews, total: reviews.length },
  });
});

export const ReviewController = {
  submitReview,
  getReviewsAboutMe,
};
