import { uploadToCloudinary } from '../../utils/cloudinary';
import { BadRequestError } from '../../utils/errors';
import { DriverService } from './driver.service';
import {
  BulkExpiryDates,
  REQUIRED_DOCUMENT_TYPES,
  REQUIRED_KYC_DOCUMENTS,
  TripHistoryQuery,
} from './driver.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

// ─────────────────────────────────────────────────────────────────────────────
// Drivers Controller  —  PRD 2.2
// Role checks live in driver.route.ts (authorize); validation in driver.validation.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/drivers/documents
 * Role: DRIVER
 *
 * Accepts all required KYC documents as multipart/form-data file fields. Each
 * buffered file is streamed to Cloudinary, then the DriverDocument row is
 * upserted and the user is set to PENDING_VERIFICATION.
 */
const uploadDocuments = catchAsync(async (req, res) => {
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

  // Guard: every required document field must be present
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

  // Optional expiry dates (already validated by validateRequest)
  const expiryDates = req.body as BulkExpiryDates;

  // Upload all files to Cloudinary concurrently
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

  const savedDocument = await DriverService.uploadDriverDocuments(req.user!.id, uploadResults);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'KYC documents uploaded successfully',
    data: {
      message: 'All 7 KYC documents uploaded successfully. Your application is now under review.',
      document: savedDocument,
    },
  });
});

/**
 * GET /api/v1/drivers/me
 * Role: DRIVER — full dashboard: profile metrics, vehicle, KYC document status.
 */
const getMyDashboard = catchAsync(async (req, res) => {
  const profile = await DriverService.getDriverDashboard(req.user!.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Driver dashboard retrieved successfully',
    data: { profile },
  });
});

/**
 * GET /api/v1/drivers/me/history
 * Role: DRIVER — paginated COMPLETED + CANCELLED rides with fare breakdown.
 */
const getTripHistory = catchAsync(async (req, res) => {
  const result = await DriverService.getDriverTripHistory(
    req.user!.id,
    req.query as unknown as TripHistoryQuery,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Trip history retrieved successfully',
    data: result,
  });
});

export const DriverController = {
  uploadDocuments,
  getMyDashboard,
  getTripHistory,
};
