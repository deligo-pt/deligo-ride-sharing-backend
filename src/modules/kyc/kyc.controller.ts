import { KycService } from './kyc.service';
import {
  BulkExpiryDates,
  REQUIRED_DOCUMENT_TYPES,
  REQUIRED_KYC_DOCUMENTS,
  ReviewDocumentInput,
  ReviewKycInput,
} from './kyc.validation';
import { uploadToCloudinary } from '../../utils/cloudinary';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { BadRequestError } from '../../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// KYC Controller
// Role checks live in kyc.route.ts (authorize); request validation in kyc.validation.ts.
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * POST /kyc/documents (BULK)
 * Driver uploads ALL required KYC documents in one multipart/form-data call.
 *
 * Each document is a file field named after its DocumentType. Optional text
 * fields `<TYPE>_expiryDate` carry ISO 8601 dates (validated in the route).
 * If ANY required file is missing, a 400 lists every absent document.
 */
const uploadDocuments = catchAsync(async (req, res) => {
  // req.files is a dictionary when using multer.fields()
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

  // Step 1: every required document type must have a file
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

  // Step 2: optional expiry dates (already validated by validateRequest)
  const expiryDates = req.body as BulkExpiryDates;

  // Step 3: upload all files to Cloudinary concurrently
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

  // Step 4: upsert all documents + set driver status to PENDING_VERIFICATION
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
};
