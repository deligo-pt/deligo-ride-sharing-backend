import { KycService } from './kyc.service';
import {
  BulkExpiryDates,
  PendingKycQueryInput,
  RejectUserInput,
  ReviewDocumentInput,
  ReviewKycInput,
} from './kyc.validation';
import { REQUIRED_DOCUMENT_TYPES, REQUIRED_KYC_DOCUMENTS } from './kyc.constant';
import { uploadToCloudinary } from '../../utils/cloudinary';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { BadRequestError } from '../../utils/errors';

/** GET /kyc/requirements — public: the full list of required KYC documents. */
const getKycRequirements = catchAsync((_req, res) => {
  const requirements = KycService.getKycRequirements();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'KYC requirements retrieved successfully',
    data: requirements,
  });
});

/** GET /kyc/status — driver checklist of uploaded documents and their status. */
const getKycStatus = catchAsync(async (req, res) => {
  const status = await KycService.getKycStatus(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'KYC status retrieved successfully',
    data: status,
  });
});

const uploadDocuments = catchAsync(async (req, res) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;

  if (!files || Object.keys(files).length === 0) {
    throw new BadRequestError(
      `No files were received. You must upload all ${REQUIRED_KYC_DOCUMENTS.length} required documents in a single request.`,
      {
        requiredDocuments: REQUIRED_KYC_DOCUMENTS.map((d) => ({
          fieldName: d.type,
          label: d.label,
          description: d.description,
        })),
      },
      'NO_FILES_UPLOADED',
    );
  }

  const missingDocuments = REQUIRED_KYC_DOCUMENTS.filter(
    (doc) => !files[doc.type] || files[doc.type].length === 0,
  );

  if (missingDocuments.length > 0) {
    throw new BadRequestError(
      `You are missing ${missingDocuments.length} of the ${REQUIRED_KYC_DOCUMENTS.length} required documents. Please attach all missing files and re-submit.`,
      {
        missingDocuments: missingDocuments.map((doc) => ({
          fieldName: doc.type,
          label: doc.label,
          description: doc.description,
          requiresExpiry: doc.requiresExpiry,
          hint: doc.requiresExpiry
            ? `Also send a text field "${doc.type}_expiryDate" with an ISO 8601 date (e.g. 2030-12-31T00:00:00Z).`
            : undefined,
        })),
        uploadedSoFar: REQUIRED_DOCUMENT_TYPES.filter(
          (type) => files[type] && files[type].length > 0,
        ),
      },
      'MISSING_REQUIRED_DOCUMENTS',
    );
  }

  const expiryDates = req.body as BulkExpiryDates;

  const uploadResults = await Promise.all(
    REQUIRED_KYC_DOCUMENTS.map(async (doc) => {
      const file = files[doc.type][0];
      const cloudinaryResult = await uploadToCloudinary(
        file.buffer,
        'kyc-documents',
        file.mimetype,
      );
      const expiryKey = `${doc.type}_expiryDate` as keyof BulkExpiryDates;

      return {
        documentType: doc.type,
        documentUrl: cloudinaryResult.secureUrl,
        expiryDate: expiryDates[expiryKey],
      };
    }),
  );

  const savedDocuments = await KycService.uploadAllDocuments(req.user!.id, uploadResults);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'KYC documents uploaded successfully',
    data: {
      message: 'All 7 KYC documents uploaded successfully. Your application is now under review.',
      document: savedDocuments,
    },
  });
});

/** GET /kyc/documents/me — driver: raw list of own documents. */
const getMyDocuments = catchAsync(async (req, res) => {
  const documents = await KycService.getMyDocuments(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Documents retrieved successfully',
    data: documents,
  });
});

/** GET /kyc/documents/pending — admin. */
const getPendingDocuments = catchAsync(async (_req, res) => {
  const documents = await KycService.getPendingDocuments();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pending documents retrieved successfully',
    data: documents,
  });
});

/** GET /kyc/documents/all — admin. */
const getAllDocuments = catchAsync(async (_req, res) => {
  const documents = await KycService.getAllDocuments();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All documents retrieved successfully',
    data: documents,
  });
});

/** PATCH /kyc/documents/:id/review — admin approves or rejects a document. */
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

/** GET /kyc/profiles/pending — admin: driver profiles waiting in the KYC review queue. */
const getPendingProfiles = catchAsync(async (_req, res) => {
  const profiles = await KycService.getPendingKycProfiles();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pending KYC profiles retrieved successfully',
    data: { count: profiles.length, profiles },
  });
});

/** PATCH /kyc/profiles/:driverProfileId/review — admin approves or rejects a driver's full KYC. */
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

/** GET /kyc/pending — admin: paginated list of pending DRIVER and FLEET_MANAGER KYC requests. */
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

/** PATCH /kyc/:id/accept-user — admin approves a DRIVER or FLEET_MANAGER user KYC. */
const acceptUser = catchAsync(async (req, res) => {
  const result = await KycService.acceptUser(req.user!.id, req.params.id as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

/** PATCH /kyc/:id/reject-user — admin rejects a DRIVER or FLEET_MANAGER user KYC. */
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

/** PATCH /kyc/:id/block-user — admin blocks/suspends a DRIVER or FLEET_MANAGER user. */
const blockUser = catchAsync(async (req, res) => {
  const result = await KycService.blockUser(req.user!.id, req.params.id as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

/** PATCH /kyc/:id/unblock-user — admin restores a previously blocked DRIVER or FLEET_MANAGER user. */
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
  uploadDocuments,
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
