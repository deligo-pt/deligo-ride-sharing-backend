import { NextFunction, Request, Response } from 'express';
import {
  uploadAllDocuments,
  getPendingDocuments,
  getAllDocuments,
  reviewDocument,
  getMyDocuments,
  getKycStatus,
  getKycRequirements,
} from './kyc.service';
import {
  reviewDocumentSchema,
  bulkExpiryDatesSchema,
  REQUIRED_KYC_DOCUMENTS,
  REQUIRED_DOCUMENT_TYPES,
} from './kyc.validation';
import { uploadToCloudinary } from '../../utils/cloudinary';
import { sendResponse } from '../../utils/sendResponse';
import { BadRequestError, ForbiddenError, toAppError } from '../../utils/errors';

// ─── GET /kyc/requirements ────────────────────────────────────────────────────
// Public: returns the full list of all 7 required KYC documents.

export const handleGetKycRequirements = (_req: Request, res: Response): void => {
  const requirements = getKycRequirements();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'KYC requirements retrieved successfully',
    data: requirements,
  });
};

// ─── GET /kyc/status ─────────────────────────────────────────────────────────
// Driver: returns checklist showing which of the 7 required documents have been
// uploaded and their current verification status.

export const handleGetKycStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user!.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can view their KYC status.');
    }

    const status = await getKycStatus(req.user!.id);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'KYC status retrieved successfully',
      data: status,
    });
  } catch (error: unknown) {
    next(
      toAppError(error, {
        statusCode: 400,
        code: 'KYC_STATUS_FAILED',
        message: 'Failed to fetch KYC status',
      }),
    );
  }
};

// ─── POST /kyc/documents (BULK) ───────────────────────────────────────────────
// Driver uploads ALL 7 required KYC documents in one multipart/form-data call.
//
// Expected fields (each a file):
//   DRIVING_LICENSE, NATIONAL_ID, VEHICLE_REGISTRATION, VEHICLE_INSURANCE,
//   DRIVER_SELFIE, PROOF_OF_ADDRESS, TAX_ID
//
// Optional text fields for expiry dates:
//   DRIVING_LICENSE_expiryDate, VEHICLE_REGISTRATION_expiryDate,
//   VEHICLE_INSURANCE_expiryDate
//
// If ANY required file field is missing, the endpoint returns a 400 with a
// detailed list of every absent document (type, label, description).

export const handleUploadDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // if (req.user!.role !== 'DRIVER') {
    //   throw new ForbiddenError('Only drivers can upload KYC documents.');
    // }

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

    // ── Step 1: Validate that every required document type has a file ──────────
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

    // ── Step 2: Parse optional expiry date text fields ─────────────────────────
    const expiryParseResult = bulkExpiryDatesSchema.safeParse(req.body);
    if (!expiryParseResult.success) {
      throw new BadRequestError(
        expiryParseResult.error.issues[0]?.message ?? 'Invalid expiry date format.',
        undefined,
        'INVALID_EXPIRY_DATE',
      );
    }
    const expiryDates = expiryParseResult.data;

    // ── Step 3: Upload all 7 files to Cloudinary concurrently ──────────────────
    const uploadResults = await Promise.all(
      REQUIRED_KYC_DOCUMENTS.map(async (doc) => {
        const file = files[doc.type][0];
        const cloudinaryResult = await uploadToCloudinary(
          file.buffer,
          'kyc-documents',
          file.mimetype,
        );

        const expiryKey = `${doc.type}_expiryDate` as keyof typeof expiryDates;

        return {
          documentType: doc.type,
          documentUrl: cloudinaryResult.secureUrl,
          expiryDate: expiryDates[expiryKey],
          cloudinaryPublicId: cloudinaryResult.publicId,
          cloudinaryBytes: cloudinaryResult.bytes,
          cloudinaryFormat: cloudinaryResult.format,
        };
      }),
    );

    // ── Step 4: Upsert all documents + set driver status to PENDING_VERIFICATION
    const savedDocuments = await uploadAllDocuments(
      req.user!.id,
      uploadResults.map(({ documentType, documentUrl, expiryDate }) => ({
        documentType,
        documentUrl,
        expiryDate,
      })),
    );

    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: 'KYC documents uploaded successfully',
      data: {
        message: 'All 7 KYC documents uploaded successfully. Your application is now under review.',
        document: savedDocuments,
      },
    });
  } catch (error: unknown) {
    next(
      toAppError(error, {
        statusCode: 500,
        code: 'DOCUMENT_UPLOAD_FAILED',
        message: 'An unexpected error occurred while uploading your documents.',
      }),
    );
  }
};

// ─── GET /kyc/documents/me ───────────────────────────────────────────────────

export const handleGetMyDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user!.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can view their own documents.');
    }

    const documents = await getMyDocuments(req.user!.id);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Documents retrieved successfully',
      data: documents,
    });
  } catch (error: unknown) {
    next(
      toAppError(error, {
        statusCode: 400,
        code: 'FETCH_MY_DOCUMENTS_FAILED',
        message: 'Failed to fetch documents',
      }),
    );
  }
};

// ─── GET /kyc/documents/pending ──────────────────────────────────────────────

export const handleGetPendingDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can access pending documents.');
    }

    const documents = await getPendingDocuments();
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Pending documents retrieved successfully',
      data: documents,
    });
  } catch (error: unknown) {
    next(
      toAppError(error, {
        statusCode: 500,
        code: 'FETCH_FAILED',
        message: 'Failed to fetch pending documents',
      }),
    );
  }
};

// ─── GET /kyc/documents/all ───────────────────────────────────────────────────

export const handleGetAllDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can access all documents.');
    }

    const documents = await getAllDocuments();
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'All documents retrieved successfully',
      data: documents,
    });
  } catch (error: unknown) {
    next(
      toAppError(error, {
        statusCode: 500,
        code: 'FETCH_FAILED',
        message: 'Failed to fetch documents',
      }),
    );
  }
};

// ─── PATCH /kyc/documents/:id/review ─────────────────────────────────────────

export const handleReviewDocument = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can review documents.');
    }

    const documentId = req.params.id as string;
    const validatedData = reviewDocumentSchema.parse({ body: req.body as unknown }).body;
    const updated = await reviewDocument(documentId, validatedData);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Document reviewed successfully',
      data: updated,
    });
  } catch (error: unknown) {
    next(
      toAppError(error, {
        statusCode: 400,
        code: 'REVIEW_FAILED',
        message: 'Failed to review document',
      }),
    );
  }
};
