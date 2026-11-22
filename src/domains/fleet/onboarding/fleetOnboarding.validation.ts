import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Fleet Manager Onboarding Validation Schemas (Steps 3–7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 3: Business Details
 */
export const businessDetailsSchema = z.object({
  businessName: z.string().trim().min(1, 'Business name is required'),
  legalBusinessName: z.string().trim().optional(),
  licenseNumber: z.string().trim().min(1, 'License number is required'),
  nifNumber: z.string().trim().min(1, 'NIF number is required'),
  businessEmail: z
    .string()
    .trim()
    .email('Invalid business email')
    .optional()
    .or(z.literal('')),
  businessPhone: z.string().trim().optional(),
});

export type BusinessDetailsInput = z.infer<typeof businessDetailsSchema>;

/**
 * Step 4: Location Details
 */
export const locationDetailsSchema = z.object({
  latitude: z
    .number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  longitude: z
    .number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  street: z.string().trim().min(1, 'Street is required'),
  city: z.string().trim().optional(),
  district: z.string().trim().optional(),
  state: z.string().trim().optional(),
  postalCode: z.string().trim().min(1, 'Postal code is required'),
  country: z.string().trim().min(1, 'Country is required'),
});

export type LocationDetailsInput = z.infer<typeof locationDetailsSchema>;

/**
 * Step 5: Bank Details
 */
export const bankDetailsSchema = z.object({
  accountHolderName: z.string().trim().min(1, 'Account holder name is required'),
  iban: z
    .string()
    .min(1, 'IBAN is required')
    .transform((val) => val.replace(/\s+/g, '').toUpperCase())
    .refine((val) => /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(val), {
      message: 'Invalid IBAN format',
    }),
});

export type BankDetailsInput = z.infer<typeof bankDetailsSchema>;

/**
 * Step 6: Verification Documents
 */
export const documentsSchema = z
  .object({
    photoUrl: z.string().url('Invalid photo URL').optional(),
    businessLicenseUrl: z.string().url('Invalid business license URL').optional(),
    idProofFrontUrl: z.string().url('Invalid ID proof front URL').optional(),
    idProofBackUrl: z.string().url('Invalid ID proof back URL').optional(),
    addressProofUrl: z.string().url('Invalid address proof URL').optional(),
    activityDocumentUrl: z.string().url('Invalid activity document URL').optional(),
    ibanProofUrl: z.string().url('Invalid IBAN proof URL').optional(),
  })
  .refine(
    (data) => Object.values(data).some((val) => val !== undefined && val !== ''),
    { message: 'At least one document URL must be provided' },
  );

export type DocumentsInput = z.infer<typeof documentsSchema>;

/**
 * Step 7: Declaration, Signer & Legal Acceptance (Submit)
 */
export const submitOnboardingSchema = z
  .object({
    signerType: z.enum(['MYSELF', 'AUTHORIZED_REPRESENTATIVE']),
    representativeName: z.string().trim().optional(),
    representativeId: z.string().trim().optional(),
    signatureUrl: z.string().url('Invalid signature URL'),
    termsAccepted: z.literal(true, {
      message: 'You must accept the terms and conditions',
    }),
    privacyAccepted: z.literal(true, {
      message: 'You must accept the privacy policy',
    }),
  })
  .superRefine((data, ctx) => {
    if (
      data.signerType === 'AUTHORIZED_REPRESENTATIVE' &&
      (!data.representativeName || data.representativeName.trim() === '')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Representative name is required when signerType is AUTHORIZED_REPRESENTATIVE',
        path: ['representativeName'],
      });
    }
  });

export type SubmitOnboardingInput = z.infer<typeof submitOnboardingSchema>;
