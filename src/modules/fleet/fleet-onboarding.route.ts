import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { FleetOnboardingController } from './fleet-onboarding.controller';
import { FleetOnboardingValidation } from './fleet-onboarding.validation';

// Mounted at: /api/v1/fleet/onboarding (see src/routes/index.ts)
const router: Router = Router();

// Authentication + FLEET_MANAGER role across all onboarding routes
router.use(authenticate, authorize('FLEET_MANAGER'));

// Current onboarding profile with computed step-completion flags
router.get('/status', FleetOnboardingController.getOnboardingStatus);

// Step 3: business details
router.patch(
  '/business',
  validateRequest(FleetOnboardingValidation.businessDetails),
  FleetOnboardingController.updateBusinessDetails,
);

// Step 4: location details
router.patch(
  '/location',
  validateRequest(FleetOnboardingValidation.locationDetails),
  FleetOnboardingController.updateLocationDetails,
);

// Step 5: bank payout details
router.patch(
  '/bank',
  validateRequest(FleetOnboardingValidation.bankDetails),
  FleetOnboardingController.updateBankDetails,
);

// Step 6: incrementally upload / update verification document URLs
router.patch(
  '/documents',
  validateRequest(FleetOnboardingValidation.documents),
  FleetOnboardingController.updateDocuments,
);

// Step 7: accept terms, sign, and submit onboarding for admin review
router.post(
  '/submit',
  validateRequest(FleetOnboardingValidation.submit),
  FleetOnboardingController.submitOnboarding,
);

export default router;
