import { Request, Response } from 'express';
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
  DocumentType,
} from './kyc.validation';
import { uploadToCloudinary } from '../../utils/cloudinary';

// ─── GET /kyc/requirements ────────────────────────────────────────────────────
// Public: returns the full list of all 7 required KYC documents.

export const handleGetKycRequirements = (_req: Request, res: Response): void => {
  const requirements = getKycRequirements();
  res.status(200).json({ success: true, data: requirements });
};

// ─── GET /kyc/status ─────────────────────────────────────────────────────────
// Driver: returns checklist showing which of the 7 required documents have been
// uploaded and their current verification status.

export const handleGetKycStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'DRIVER') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only drivers can view their KYC status.' },
      });
      return;
    }

    const status = await getKycStatus(req.user!.id);
    res.status(200).json({ success: true, data: status });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(400).json({
      success: false,
      error: { code: 'KYC_STATUS_FAILED', message: err.message ?? 'Failed to fetch KYC status' },
    });
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

export const handleUploadDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    // if (req.user!.role !== 'DRIVER') {
    //   res.status(403).json({
    //     success: false,
    //     error: { code: 'FORBIDDEN', message: 'Only drivers can upload KYC documents.' },
    //   });
    //   return;
    // }

    // req.files is a dictionary when using multer.fields()
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    if (!files || Object.keys(files).length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILES_UPLOADED',
          message: `No files were received. You must upload all ${REQUIRED_KYC_DOCUMENTS.length} required documents in a single request.`,
          requiredDocuments: REQUIRED_KYC_DOCUMENTS.map((d) => ({
            fieldName: d.type,
            label: d.label,
            description: d.description,
          })),
        },
      });
      return;
    }

    // ── Step 1: Validate that every required document type has a file ──────────
    const missingDocuments = REQUIRED_KYC_DOCUMENTS.filter(
      (doc) => !files[doc.type] || files[doc.type].length === 0,
    );

    if (missingDocuments.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_DOCUMENTS',
          message: `You are missing ${missingDocuments.length} of the ${REQUIRED_KYC_DOCUMENTS.length} required documents. Please attach all missing files and re-submit.`,
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
      });
      return;
    }

    // ── Step 2: Parse optional expiry date text fields ─────────────────────────
    const expiryParseResult = bulkExpiryDatesSchema.safeParse(req.body);
    if (!expiryParseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EXPIRY_DATE',
          message: expiryParseResult.error.issues[0]?.message ?? 'Invalid expiry date format.',
        },
      });
      return;
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
          documentType: doc.type as DocumentType,
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

    res.status(201).json({
      success: true,
      data: {
        message: 'All 7 KYC documents uploaded successfully. Your application is now under review.',
        document: savedDocuments,
      },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(500).json({
      success: false,
      error: {
        code: 'DOCUMENT_UPLOAD_FAILED',
        message: err.message ?? 'An unexpected error occurred while uploading your documents.',
      },
    });
  }
};

// ─── GET /kyc/documents/me ───────────────────────────────────────────────────

export const handleGetMyDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'DRIVER') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only drivers can view their own documents.' },
      });
      return;
    }

    const documents = await getMyDocuments(req.user!.id);
    res.status(200).json({ success: true, data: documents });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(400).json({
      success: false,
      error: {
        code: 'FETCH_MY_DOCUMENTS_FAILED',
        message: err.message ?? 'Failed to fetch documents',
      },
    });
  }
};

// ─── GET /kyc/documents/pending ──────────────────────────────────────────────

export const handleGetPendingDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admins can access pending documents.' },
      });
      return;
    }

    const documents = await getPendingDocuments();
    res.status(200).json({ success: true, data: documents });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: err.message ?? 'Failed to fetch pending documents' },
    });
  }
};

// ─── GET /kyc/documents/all ───────────────────────────────────────────────────

export const handleGetAllDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admins can access all documents.' },
      });
      return;
    }

    const documents = await getAllDocuments();
    res.status(200).json({ success: true, data: documents });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: err.message ?? 'Failed to fetch documents' },
    });
  }
};

// ─── PATCH /kyc/documents/:id/review ─────────────────────────────────────────

export const handleReviewDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admins can review documents.' },
      });
      return;
    }

    const documentId = req.params.id as string;
    const validatedData = reviewDocumentSchema.parse({ body: req.body }).body;
    const updated = await reviewDocument(documentId, validatedData);

    res.status(200).json({ success: true, data: updated });
  } catch (error: unknown) {
    const err = error as { name?: string; errors?: { message?: string }[]; message?: string };
    if (err.name === 'ZodError') {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors?.[0]?.message ?? 'Validation failed',
        },
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: { code: 'REVIEW_FAILED', message: err.message ?? 'Failed to review document' },
    });
  }
};
