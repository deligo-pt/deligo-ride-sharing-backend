import { KycService } from './kyc.service';
import {
  PendingKycQueryInput,
  RejectUserInput,
  ReviewDocumentInput,
  ReviewKycInput,
  SubmitKycDocumentsInput,
} from './kyc.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

const getKycRequirements = catchAsync((_req, res) => {
  const requirements = KycService.getKycRequirements();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'KYC requirements retrieved successfully',
    data: requirements,
  });
});

const getKycStatus = catchAsync(async (req, res) => {
  const status = await KycService.getKycStatus(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'KYC status retrieved successfully',
    data: status,
  });
});

const submitDocuments = catchAsync(async (req, res) => {
  const { documents } = req.body as SubmitKycDocumentsInput;

  const savedDocuments = await KycService.submitAllDocuments(req.user!.id, documents);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'KYC documents submitted successfully',
    data: {
      message: 'All 7 KYC documents submitted successfully. Your application is now under review.',
      document: savedDocuments,
    },
  });
});

const getMyDocuments = catchAsync(async (req, res) => {
  const documents = await KycService.getMyDocuments(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Documents retrieved successfully',
    data: documents,
  });
});

const getPendingDocuments = catchAsync(async (_req, res) => {
  const documents = await KycService.getPendingDocuments();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pending documents retrieved successfully',
    data: documents,
  });
});

const getAllDocuments = catchAsync(async (_req, res) => {
  const documents = await KycService.getAllDocuments();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All documents retrieved successfully',
    data: documents,
  });
});

const reviewDocument = catchAsync(async (req, res) => {
  const updated = await KycService.reviewDocument(
    req.params.id as string,
    req.body as ReviewDocumentInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Document reviewed successfully',
    data: updated,
  });
});

const getPendingProfiles = catchAsync(async (_req, res) => {
  const profiles = await KycService.getPendingKycProfiles();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pending KYC profiles retrieved successfully',
    data: { count: profiles.length, profiles },
  });
});

const reviewProfile = catchAsync(async (req, res) => {
  const result = await KycService.reviewDriverKyc(
    req.params.driverProfileId as string,
    req.body as ReviewKycInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Driver KYC reviewed successfully',
    data: result,
  });
});

const getPendingKyc = catchAsync(async (req, res) => {
  const result = await KycService.getPendingKyc(req.query as unknown as PendingKycQueryInput);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pending KYC requests retrieved successfully',
    meta: result.meta,
    data: {
      items: result.items,
    },
  });
});

const acceptUser = catchAsync(async (req, res) => {
  const result = await KycService.acceptUser(req.user!.id, req.params.id as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const rejectUser = catchAsync(async (req, res) => {
  const result = await KycService.rejectUser(
    req.user!.id,
    req.params.id as string,
    req.body as RejectUserInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const blockUser = catchAsync(async (req, res) => {
  const result = await KycService.blockUser(req.user!.id, req.params.id as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const unblockUser = catchAsync(async (req, res) => {
  const result = await KycService.unblockUser(req.user!.id, req.params.id as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

export const KycController = {
  getPendingProfiles,
  reviewProfile,
  getKycRequirements,
  getKycStatus,
  submitDocuments,
  getMyDocuments,
  getPendingDocuments,
  getAllDocuments,
  reviewDocument,
  getPendingKyc,
  acceptUser,
  rejectUser,
  blockUser,
  unblockUser,
};
