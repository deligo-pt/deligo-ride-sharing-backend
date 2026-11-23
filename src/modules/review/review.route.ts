import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { ReviewController } from './review.controller';
import { ReviewValidation } from './review.validation';

// Mounted at: /api/v1/reviews (see src/routes/index.ts)
const router: Router = Router();

// MUST stay before any /:id routes so "me" is not matched as a param
router.get('/me', authenticate, ReviewController.getReviewsAboutMe);

// Body: { rideId, rating, comment? } — CUSTOMER or DRIVER
router.post(
  '/',
  authenticate,
  validateRequest(ReviewValidation.create),
  ReviewController.submitReview,
);

export default router;
