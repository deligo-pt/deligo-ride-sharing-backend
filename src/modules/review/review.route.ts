import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { ReviewController } from './review.controller';
import { ReviewValidation } from './review.validation';

const router: Router = Router();

router.get('/me', authenticate, ReviewController.getReviewsAboutMe);

router.post(
  '/',
  authenticate,
  validateRequest(ReviewValidation.create),
  ReviewController.submitReview,
);

export default router;
