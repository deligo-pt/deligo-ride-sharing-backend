import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as reviewsController from './review.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Reviews Router
// Mounted at: /api/v1/reviews  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router: Router = Router();

/**
 * GET /api/v1/reviews/me
 * Returns all reviews about the logged-in user (newest first).
 * MUST be before /:id routes to prevent "me" matching a param.
 */
router.get('/me', authenticate, reviewsController.getReviewsAboutMe);

/**
 * POST /api/v1/reviews
 * Submit a review for a completed ride (CUSTOMER or DRIVER).
 * Body: { rideId, rating, comment? }
 */
router.post('/', authenticate, reviewsController.submitReview);

export default router;
