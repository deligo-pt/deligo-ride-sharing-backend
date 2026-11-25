import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { FleetController } from './fleet.controller';
import { FleetValidation } from './fleet.validation';

const router: Router = Router();

router.get(
  '/onboarding/status',
  authenticate,
  authorize('FLEET_MANAGER'),
  FleetController.getOnboardingStatus,
);

router.patch(
  '/onboarding/business',
  authenticate,
  authorize('FLEET_MANAGER'),
  validateRequest(FleetValidation.businessDetails),
  FleetController.updateBusinessDetails,
);

router.patch(
  '/onboarding/location',
  authenticate,
  authorize('FLEET_MANAGER'),
  validateRequest(FleetValidation.locationDetails),
  FleetController.updateLocationDetails,
);

router.patch(
  '/onboarding/bank',
  authenticate,
  authorize('FLEET_MANAGER'),
  validateRequest(FleetValidation.bankDetails),
  FleetController.updateBankDetails,
);

router.patch(
  '/onboarding/documents',
  authenticate,
  authorize('FLEET_MANAGER'),
  validateRequest(FleetValidation.documents),
  FleetController.updateDocuments,
);

router.post(
  '/onboarding/submit',
  authenticate,
  authorize('FLEET_MANAGER'),
  validateRequest(FleetValidation.submit),
  FleetController.submitOnboarding,
);

export const fleetRouter = router;
