import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Drivers Domain — Validation Schemas  (PRD 2.2)
// ─────────────────────────────────────────────────────────────────────────────

// ── Document Types ────────────────────────────────────────────────────────────

export type DocumentType =
  | 'DRIVING_LICENSE'
  | 'NATIONAL_ID'
  | 'VEHICLE_REGISTRATION'
  | 'VEHICLE_INSURANCE'
  | 'DRIVER_SELFIE'
  | 'PROOF_OF_ADDRESS'
  | 'TAX_ID';

export interface RequiredDocument {
  type: DocumentType;
  label: string;
  description: string;
  requiresExpiry: boolean;
}

export const REQUIRED_KYC_DOCUMENTS: RequiredDocument[] = [
  {
    type: 'DRIVING_LICENSE',
    label: 'Valid Driver License',
    description: "A government-issued driver's license that is currently valid.",
    requiresExpiry: true,
  },
  {
    type: 'NATIONAL_ID',
    label: 'National Identification Document',
    description: 'National ID card, passport, or any government-issued photo ID.',
    requiresExpiry: false,
  },
  {
    type: 'VEHICLE_REGISTRATION',
    label: 'Vehicle Registration Certificate',
    description: 'Official certificate proving the vehicle is registered in your name.',
    requiresExpiry: true,
  },
  {
    type: 'VEHICLE_INSURANCE',
    label: 'Vehicle Insurance Certificate',
    description: 'Current and valid vehicle insurance policy document.',
    requiresExpiry: true,
  },
  {
    type: 'DRIVER_SELFIE',
    label: 'Driver Selfie Verification',
    description: "A clear, recent photo of the driver's face (no sunglasses or hats).",
    requiresExpiry: false,
  },
  {
    type: 'PROOF_OF_ADDRESS',
    label: 'Proof of Address',
    description:
      'Recent utility bill, bank statement, or official mail (not older than 3 months).',
    requiresExpiry: false,
  },
  {
    type: 'TAX_ID',
    label: 'Tax Identification Number',
    description: 'Government-issued Tax ID or TIN document.',
    requiresExpiry: false,
  },
];

export const REQUIRED_DOCUMENT_TYPES = REQUIRED_KYC_DOCUMENTS.map((d) => d.type);

// ── POST /drivers/documents — optional expiry date text fields ─────────────────

const isoDatetime = z
  .string()
  .datetime({ message: 'Must be a valid ISO 8601 datetime (e.g. 2030-12-31T00:00:00Z)' })
  .optional();

const BulkExpiryDatesSchema = z.object({
  DRIVING_LICENSE_expiryDate: isoDatetime,
  VEHICLE_REGISTRATION_expiryDate: isoDatetime,
  VEHICLE_INSURANCE_expiryDate: isoDatetime,
});

export type BulkExpiryDates = z.infer<typeof BulkExpiryDatesSchema>;

export interface SingleDocumentPayload {
  documentType: DocumentType;
  documentUrl: string;
  expiryDate?: string;
}

// ── GET /drivers/me/history — pagination query ─────────────────────────────────

const TripHistoryQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().positive('page must be a positive integer')),

  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 10))
    .pipe(
      z
        .number()
        .int()
        .positive('limit must be a positive integer')
        .max(100, 'limit cannot exceed 100'),
    ),
});

export type TripHistoryQuery = z.infer<typeof TripHistoryQuerySchema>;

export const DriverValidation = {
  /** POST /drivers/documents — optional expiry-date text fields (runs after multer). */
  uploadDocuments: { body: BulkExpiryDatesSchema },
  /** GET /drivers/me/history */
  tripHistory: { query: TripHistoryQuerySchema },
};
