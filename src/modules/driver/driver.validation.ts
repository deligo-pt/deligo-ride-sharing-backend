import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Drivers Domain — Validation Schemas  (PRD 2.2)
// KYC document upload lives in the kyc module (POST /kyc/documents).
// ─────────────────────────────────────────────────────────────────────────────

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
  /** GET /drivers/me/history */
  tripHistory: { query: TripHistoryQuerySchema },
};
