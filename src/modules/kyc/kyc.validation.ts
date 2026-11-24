import { z } from 'zod';
// ─── POST /kyc/documents (BULK) ──────────────────────────────────────────────
// The driver sends one multipart/form-data request with ALL 7 required files.
// Each file field must be named after the DocumentType enum value, e.g.:
//   • DRIVING_LICENSE       — file
//   • NATIONAL_ID           — file
//   • VEHICLE_REGISTRATION  — file
//   • VEHICLE_INSURANCE     — file
//   • DRIVER_SELFIE         — file
//   • PROOF_OF_ADDRESS      — file
//   • TAX_ID                — file
//
// Optional expiry dates (ISO 8601) are passed as text fields:
//   • DRIVING_LICENSE_expiryDate
//   • VEHICLE_REGISTRATION_expiryDate
//   • VEHICLE_INSURANCE_expiryDate

// Zod schema for the optional expiry dates sent in the body
const isoDatetime = z
  .string()
  .datetime({ message: 'Must be a valid ISO 8601 datetime (e.g. 2030-12-31T00:00:00Z)' })
  .optional();

const bulkExpiryDatesSchema = z.object({
  DRIVING_LICENSE_expiryDate: isoDatetime,
  VEHICLE_REGISTRATION_expiryDate: isoDatetime,
  VEHICLE_INSURANCE_expiryDate: isoDatetime,
});

export type BulkExpiryDates = z.infer<typeof bulkExpiryDatesSchema>;

// ─── PATCH /kyc/documents/:id/review ─────────────────────────────────────────
// Admin approves or rejects a document.

const reviewDocumentBodySchema = z
  .object({
    verificationStatus: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED', 'TEMPORARILY_BLOCKED']),
    reviewNote: z.string().optional(),
    rejectionReason: z.string().optional(),
  })
  .refine((data) => data.verificationStatus === 'APPROVED' || !!data.rejectionReason, {
    message: 'rejectionReason is required when rejecting, suspending, or blocking a document',
    path: ['rejectionReason'],
  });

export type ReviewDocumentInput = z.infer<typeof reviewDocumentBodySchema>;

// ─── PATCH /kyc/profiles/:driverProfileId/review ────────────────────────────────────────

const ReviewKycSchema = z
  .object({
    /**
     * The top-level KYC decision: APPROVED or REJECTED.
     * Determines whether the driver profile is activated.
     */
    kycStatus: z.enum(['APPROVED', 'REJECTED'], {
      error: 'kycStatus must be APPROVED or REJECTED',
    }),

    /**
     * Required when kycStatus === 'REJECTED'. Explains why the submission failed.
     */
    rejectionReason: z.string().min(10).max(500).optional(),

    /**
     * Optional admin note (visible internally, not exposed to driver).
     */
    reviewNote: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kycStatus === 'REJECTED' && !data.rejectionReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectionReason'],
        message: 'rejectionReason is required when kycStatus is REJECTED',
      });
    }
  });

export type ReviewKycInput = z.infer<typeof ReviewKycSchema>;

// ─── PATCH /kyc/profiles/:driverProfileId/review params ─────────────────────────────────

const DriverProfileIdParamSchema = z.object({
  driverProfileId: z.string().uuid('driverProfileId must be a valid UUID'),
});

export type DriverProfileIdParam = z.infer<typeof DriverProfileIdParamSchema>;

// ─── Unified Admin KYC Review & Block/Unblock Schemas ────────────────────────

const UserIdParamSchema = z.object({
  id: z.string().uuid('Invalid user ID format'),
});

export type UserIdParam = z.infer<typeof UserIdParamSchema>;

const PendingKycQuerySchema = z.object({
  role: z.enum(['DRIVER', 'FLEET_MANAGER']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PendingKycQueryInput = z.infer<typeof PendingKycQuerySchema>;

const RejectUserBodySchema = z.object({
  rejectionReason: z.string().trim().min(5).max(500),
});

export type RejectUserInput = z.infer<typeof RejectUserBodySchema>;

// ─── Grouped validation (consumed by validateRequest in kyc.route.ts) ─────────

export const KycValidation = {
  reviewProfile: { params: DriverProfileIdParamSchema, body: ReviewKycSchema },
  /** POST /kyc/documents — optional expiry-date text fields (runs after multer). */
  uploadDocuments: { body: bulkExpiryDatesSchema },
  /** PATCH /kyc/documents/:id/review */
  reviewDocument: { body: reviewDocumentBodySchema },
  /** GET /kyc/pending */
  getPendingKyc: { query: PendingKycQuerySchema },
  /** PATCH /kyc/:id/accept-user */
  acceptUser: { params: UserIdParamSchema },
  /** PATCH /kyc/:id/reject-user */
  rejectUser: { params: UserIdParamSchema, body: RejectUserBodySchema },
  /** PATCH /kyc/:id/block-user */
  blockUser: { params: UserIdParamSchema },
  /** PATCH /kyc/:id/unblock-user */
  unblockUser: { params: UserIdParamSchema },
};
