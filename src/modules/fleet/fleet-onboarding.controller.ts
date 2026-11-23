import { FleetOnboardingService } from './fleet-onboarding.service';
import {
  BankDetailsInput,
  BusinessDetailsInput,
  DocumentsInput,
  LocationDetailsInput,
  SubmitOnboardingInput,
} from './fleet-onboarding.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

// ─────────────────────────────────────────────────────────────────────────────
// Fleet Manager Onboarding Controller
// The router applies authenticate + authorize('FLEET_MANAGER') to every route.
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/fleet/onboarding/status */
const getOnboardingStatus = catchAsync(async (req, res) => {
  const result = await FleetOnboardingService.getOnboardingStatus(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Onboarding status retrieved successfully',
    data: result,
  });
});

/** PATCH /api/v1/fleet/onboarding/business — Step 3 */
const updateBusinessDetails = catchAsync(async (req, res) => {
  const result = await FleetOnboardingService.updateBusinessDetails(
    req.user!.id,
    req.body as BusinessDetailsInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Business details updated successfully',
    data: result,
  });
});

/** PATCH /api/v1/fleet/onboarding/location — Step 4 */
const updateLocationDetails = catchAsync(async (req, res) => {
  const result = await FleetOnboardingService.updateLocationDetails(
    req.user!.id,
    req.body as LocationDetailsInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Location details updated successfully',
    data: result,
  });
});

/** PATCH /api/v1/fleet/onboarding/bank — Step 5 */
const updateBankDetails = catchAsync(async (req, res) => {
  const result = await FleetOnboardingService.updateBankDetails(
    req.user!.id,
    req.body as BankDetailsInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Bank details updated successfully',
    data: result,
  });
});

/** PATCH /api/v1/fleet/onboarding/documents — Step 6 */
const updateDocuments = catchAsync(async (req, res) => {
  const result = await FleetOnboardingService.updateDocuments(
    req.user!.id,
    req.body as DocumentsInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Documents updated successfully',
    data: result,
  });
});

/** POST /api/v1/fleet/onboarding/submit — Step 7: accept terms, sign, submit for review */
const submitOnboarding = catchAsync(async (req, res) => {
  const result = await FleetOnboardingService.submitOnboarding(
    req.user!.id,
    req.body as SubmitOnboardingInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Onboarding submitted for review',
    data: result,
  });
});

export const FleetOnboardingController = {
  getOnboardingStatus,
  updateBusinessDetails,
  updateLocationDetails,
  updateBankDetails,
  updateDocuments,
  submitOnboarding,
};
