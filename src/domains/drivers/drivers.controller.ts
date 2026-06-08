import { NextFunction, Request, Response } from 'express';
import { uploadToCloudinary } from '../../utils/cloudinary';
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import {
  getDriverDashboard,
  getDriverTripHistory,
  uploadDriverDocuments,
} from './drivers.service';
import {
  BulkExpiryDatesSchema,
  REQUIRED_DOCUMENT_TYPES,
  REQUIRED_KYC_DOCUMENTS,
  TripHistoryQuerySchema,
  type DocumentType,
} from './drivers.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Drivers Controller  —  PRD 2.2
// ─────────────────────────────────────────────────────────────────────────────

/** Map service sentinel strings → typed HTTP errors */
function mapError(err: unknown): unknown {
  if (err instanceof Error) {
    switch (err.message) {
      case 'DRIVER_PROFILE_NOT_FOUND':
        return new NotFoundError('Driver profile');
    }
  }
  return err;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/drivers/documents
 * Role: DRIVER
 *
 * Accepts all 7 required KYC documents as multipart/form-data file fields.
 * Each file is streamed from the in-memory Multer buffer directly to Cloudinary.
 * On success, upserts the DriverDocument row and sets user status to PENDING_VERIFICATION.
 */
export async function uploadDocumentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can upload KYC documents');
    }

    // req.files is a dictionary when using multer.fields()
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    if (!files || Object.keys(files).length === 0) {
      throw new BadRequestError(
        `No files received. You must upload all ${REQUIRED_KYC_DOCUMENTS.length} required documents.`,
        {
          requiredDocuments: REQUIRED_KYC_DOCUMENTS.map((d) => ({
            fieldName: d.type,
            label: d.label,
            description: d.description,
          })),
        },
      );
    }

    // ── Guard: every required document field must be present ──────────────────
    const missingDocs = REQUIRED_KYC_DOCUMENTS.filter(
      (doc) => !files[doc.type] || files[doc.type].length === 0,
    );

    if (missingDocs.length > 0) {
      throw new BadRequestError(
        `Missing ${missingDocs.length} of ${REQUIRED_KYC_DOCUMENTS.length} required documents. Re-submit with all files.`,
        {
          missingDocuments: missingDocs.map((doc) => ({
            fieldName: doc.type,
            label: doc.label,
            requiresExpiry: doc.requiresExpiry,
            hint: doc.requiresExpiry
              ? `Also send a text field "${doc.type}_expiryDate" with ISO 8601 date (e.g. 2030-12-31T00:00:00Z).`
              : undefined,
          })),
          uploadedSoFar: REQUIRED_DOCUMENT_TYPES.filter(
            (type) => files[type] && files[type].length > 0,
          ),
        },
      );
    }

    // ── Validate optional expiry date text fields ─────────────────────────────
    const expiryParsed = BulkExpiryDatesSchema.safeParse(req.body);
    if (!expiryParsed.success) {
      throw new ValidationError(
        'Invalid expiry date format',
        expiryParsed.error.flatten().fieldErrors,
      );
    }
    const expiryDates = expiryParsed.data;

    // ── Upload all 7 files to Cloudinary concurrently ─────────────────────────
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
        };
      }),
    );

    // ── Upsert DriverDocument + mark user as PENDING_VERIFICATION ─────────────
    const savedDocument = await uploadDriverDocuments(req.user!.id, uploadResults);

    res.status(201).json({
      success: true,
      data: {
        message:
          'All 7 KYC documents uploaded successfully. Your application is now under review.',
        document: savedDocument,
      },
    });
  } catch (err) {
    next(mapError(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/drivers/me
 * Role: DRIVER
 *
 * Returns the full driver dashboard: profile metrics, vehicle, and KYC document status.
 */
export async function getMyDashboardHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can access this dashboard');
    }

    const profile = await getDriverDashboard(req.user!.id);

    res.status(200).json({ success: true, data: { profile } });
  } catch (err) {
    next(mapError(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/drivers/me/history
 * Role: DRIVER
 *
 * Returns paginated COMPLETED + CANCELLED rides for the authenticated driver.
 * Includes customer name, averageRating, and fare breakdown per trip.
 */
export async function getTripHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'DRIVER') {
      throw new ForbiddenError('Only drivers can access their trip history');
    }

    const parsed = TripHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query parameters', parsed.error.flatten().fieldErrors);
    }

    const result = await getDriverTripHistory(req.user!.id, parsed.data);

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(mapError(err));
  }
}
