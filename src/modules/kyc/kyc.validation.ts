import { z } from "zod";
export type DocumentType = 
  | "DRIVING_LICENSE"
  | "NATIONAL_ID"
  | "VEHICLE_REGISTRATION"
  | "VEHICLE_INSURANCE"
  | "DRIVER_SELFIE"
  | "PROOF_OF_ADDRESS"
  | "TAX_ID";

// ─────────────────────────────────────────────────────────────────────────────
// Required KYC Documents
//
// All 7 document types below are MANDATORY for a driver to be fully verified.
// The driver must submit every one of them in a single POST /kyc/documents
// request. Any missing document type will result in a 400 error that lists
// exactly which documents are absent.
// ─────────────────────────────────────────────────────────────────────────────

export interface RequiredDocument {
  type: DocumentType;
  label: string;
  description: string;
  requiresExpiry: boolean;
}

export const REQUIRED_KYC_DOCUMENTS: RequiredDocument[] = [
  {
    type: "DRIVING_LICENSE",
    label: "Valid Driver License",
    description: "A government-issued driver's license that is currently valid.",
    requiresExpiry: true,
  },
  {
    type: "NATIONAL_ID",
    label: "National Identification Document",
    description: "National ID card, passport, or any government-issued photo ID.",
    requiresExpiry: false,
  },
  {
    type: "VEHICLE_REGISTRATION",
    label: "Vehicle Registration Certificate",
    description: "Official certificate proving the vehicle is registered in your name.",
    requiresExpiry: true,
  },
  {
    type: "VEHICLE_INSURANCE",
    label: "Vehicle Insurance Certificate",
    description: "Current and valid vehicle insurance policy document.",
    requiresExpiry: true,
  },
  {
    type: "DRIVER_SELFIE",
    label: "Driver Selfie Verification",
    description: "A clear, recent photo of the driver's face (no sunglasses or hats).",
    requiresExpiry: false,
  },
  {
    type: "PROOF_OF_ADDRESS",
    label: "Proof of Address",
    description: "Recent utility bill, bank statement, or official mail (not older than 3 months).",
    requiresExpiry: false,
  },
  {
    type: "TAX_ID",
    label: "Tax Identification Number",
    description: "Government-issued Tax ID or TIN document.",
    requiresExpiry: false,
  },
];

export const REQUIRED_DOCUMENT_TYPES = REQUIRED_KYC_DOCUMENTS.map((d) => d.type);

// Document types that REQUIRE an expiry date (warn driver if omitted)
export const EXPIRY_REQUIRED_TYPES: DocumentType[] = REQUIRED_KYC_DOCUMENTS
  .filter((d) => d.requiresExpiry)
  .map((d) => d.type);

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
  .datetime({ message: "Must be a valid ISO 8601 datetime (e.g. 2030-12-31T00:00:00Z)" })
  .optional();

const bulkExpiryDatesSchema = z.object({
  DRIVING_LICENSE_expiryDate: isoDatetime,
  VEHICLE_REGISTRATION_expiryDate: isoDatetime,
  VEHICLE_INSURANCE_expiryDate: isoDatetime,
});

export type BulkExpiryDates = z.infer<typeof bulkExpiryDatesSchema>;

// Per-document payload resolved by the controller after multer + Cloudinary
export interface SingleDocumentPayload {
  documentType: DocumentType;
  documentUrl: string;
  expiryDate?: string;
}

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

// ─── Grouped validation (consumed by validateRequest in kyc.route.ts) ─────────

export const KycValidation = {
  /** POST /kyc/documents — optional expiry-date text fields (runs after multer). */
  uploadDocuments: { body: bulkExpiryDatesSchema },
  /** PATCH /kyc/documents/:id/review */
  reviewDocument: { body: reviewDocumentBodySchema },
};
