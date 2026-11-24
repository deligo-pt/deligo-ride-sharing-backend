import { FleetService } from './fleet.service';
import {
  BankDetailsInput,
  BusinessDetailsInput,
  DocumentsInput,
  LocationDetailsInput,
  SubmitOnboardingInput,
} from './fleet.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

const getOnboardingStatus = catchAsync(async (req, res) => {
  const result = await FleetService.getOnboardingStatus(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Onboarding status retrieved successfully',
    data: result,
  });
});

const updateBusinessDetails = catchAsync(async (req, res) => {
  const result = await FleetService.updateBusinessDetails(
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
  const result = await FleetService.updateLocationDetails(
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
  const result = await FleetService.updateBankDetails(req.user!.id, req.body as BankDetailsInput);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Bank details updated successfully',
    data: result,
  });
});

/** PATCH /api/v1/fleet/onboarding/documents — Step 6 */
const updateDocuments = catchAsync(async (req, res) => {
  const result = await FleetService.updateDocuments(req.user!.id, req.body as DocumentsInput);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Documents updated successfully',
    data: result,
  });
});

/** POST /api/v1/fleet/onboarding/submit — Step 7: accept terms, sign, submit for review */
const submitOnboarding = catchAsync(async (req, res) => {
  const result = await FleetService.submitOnboarding(
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

export const FleetController = {
  getOnboardingStatus,
  updateBusinessDetails,
  updateLocationDetails,
  updateBankDetails,
  updateDocuments,
  submitOnboarding,
};
