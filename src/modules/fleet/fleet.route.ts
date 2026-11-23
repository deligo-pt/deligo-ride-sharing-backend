import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { FleetController } from './fleet.controller';
import { FleetValidation } from './fleet.validation';

// Mounted at: /api/v1/fleet (see src/routes/index.ts).
// Every route is FLEET_MANAGER only; the onboarding flow lives under /fleet/onboarding.
const router: Router = Router();

// Current onboarding profile with computed step-completion flags
router.get(
  '/onboarding/status',
  authenticate,
  authorize('FLEET_MANAGER'),
  FleetController.getOnboardingStatus,
);

// Step 3: business details
router.patch(
  '/onboarding/business',
  authenticate,
  authorize('FLEET_MANAGER'),
  validateRequest(FleetValidation.businessDetails),
  FleetController.updateBusinessDetails,
);

// Step 4: location details
router.patch(
  '/onboarding/location',
  authenticate,
  authorize('FLEET_MANAGER'),
  validateRequest(FleetValidation.locationDetails),
  FleetController.updateLocationDetails,
);

// Step 5: bank payout details
router.patch(
  '/onboarding/bank',
  authenticate,
  authorize('FLEET_MANAGER'),
  validateRequest(FleetValidation.bankDetails),
  FleetController.updateBankDetails,
);

// Step 6: incrementally upload / update verification document URLs
router.patch(
  '/onboarding/documents',
  authenticate,
  authorize('FLEET_MANAGER'),
  validateRequest(FleetValidation.documents),
  FleetController.updateDocuments,
);

// Step 7: accept terms, sign, and submit onboarding for admin review
router.post(
  '/onboarding/submit',
  authenticate,
  authorize('FLEET_MANAGER'),
  validateRequest(FleetValidation.submit),
  FleetController.submitOnboarding,
);

export default router;
