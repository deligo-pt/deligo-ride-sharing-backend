import { ReviewService } from './review.service';
import { CreateReviewDto } from './review.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

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
