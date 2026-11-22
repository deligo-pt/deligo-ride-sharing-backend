import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import {
  getOnboardingStatusHandler,
  submitOnboardingHandler,
  updateBankDetailsHandler,
  updateBusinessDetailsHandler,
  updateDocumentsHandler,
  updateLocationDetailsHandler,
} from './fleet-onboarding.controller';
import {
  bankDetailsSchema,
  businessDetailsSchema,
  documentsSchema,
  locationDetailsSchema,
  submitOnboardingSchema,
} from './fleet-onboarding.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Fleet Manager Onboarding Router
// Mounted at: /api/v1/fleet/onboarding  (see routes/index.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router: Router = Router();

// Enforce authentication and role requirement across all onboarding routes
router.use(authenticate, authorize('FLEET_MANAGER'));

/**
 * GET /api/v1/fleet/onboarding/status
 * Fetches the current onboarding profile along with computed step completion flags.
 */
router.get('/status', getOnboardingStatusHandler);

/**
 * PATCH /api/v1/fleet/onboarding/business
 * Step 3: Update business details
 */
router.patch(
  '/business',
  validate({ body: businessDetailsSchema }),
  updateBusinessDetailsHandler,
);

/**
 * PATCH /api/v1/fleet/onboarding/location
 * Step 4: Update location details
 */
router.patch(
  '/location',
  validate({ body: locationDetailsSchema }),
  updateLocationDetailsHandler,
);

/**
 * PATCH /api/v1/fleet/onboarding/bank
 * Step 5: Update bank payout details
 */
router.patch(
  '/bank',
  validate({ body: bankDetailsSchema }),
  updateBankDetailsHandler,
);

/**
 * PATCH /api/v1/fleet/onboarding/documents
 * Step 6: Incrementally upload / update verification document URLs
 */
router.patch(
  '/documents',
  validate({ body: documentsSchema }),
  updateDocumentsHandler,
);

/**
 * POST /api/v1/fleet/onboarding/submit
 * Step 7: Accept terms, sign, and submit onboarding for admin review
 */
router.post(
  '/submit',
  validate({ body: submitOnboardingSchema }),
  submitOnboardingHandler,
);

export default router;
