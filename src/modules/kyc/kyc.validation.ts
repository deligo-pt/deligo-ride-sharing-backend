import { z } from 'zod';
import { storedFileUrlSchema } from '../upload/upload.validation';
import { REQUIRED_DOCUMENT_TYPES } from './kyc.constant';
import type { DocumentType } from './kyc.interface';

const isoDatetime = z
  .string()
  .datetime({ message: 'Must be a valid ISO 8601 datetime (e.g. 2030-12-31T00:00:00Z)' })
  .optional();

const kycDocumentSchema = z.object({
  documentType: z.enum(REQUIRED_DOCUMENT_TYPES as [DocumentType, ...DocumentType[]], {
    error: `documentType must be one of: ${REQUIRED_DOCUMENT_TYPES.join(', ')}`,
  }),
  documentUrl: storedFileUrlSchema('kyc-documents'),
  expiryDate: isoDatetime,
});

const submitKycDocumentsSchema = z
  .object({
    documents: z.array(kycDocumentSchema, { error: 'documents must be an array' }),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.documents.forEach((doc, index) => {
      if (seen.has(doc.documentType)) {
        ctx.addIssue({
          code: 'custom',
          path: ['documents', index, 'documentType'],
          message: `Duplicate document type ${doc.documentType}`,
        });
      }
      seen.add(doc.documentType);
    });

    const missing = REQUIRED_DOCUMENT_TYPES.filter((type) => !seen.has(type));
    if (missing.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['documents'],
        message: `All ${REQUIRED_DOCUMENT_TYPES.length} documents are required. Missing: ${missing.join(', ')}`,
      });
    }
  });

export type SubmitKycDocumentsInput = z.infer<typeof submitKycDocumentsSchema>;

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

const ReviewKycSchema = z
  .object({
    kycStatus: z.enum(['APPROVED', 'REJECTED'], {
      error: 'kycStatus must be APPROVED or REJECTED',
    }),

    rejectionReason: z.string().min(10).max(500).optional(),

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

const DriverProfileIdParamSchema = z.object({
  driverProfileId: z.string().uuid('driverProfileId must be a valid UUID'),
});

export type DriverProfileIdParam = z.infer<typeof DriverProfileIdParamSchema>;

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

export const KycValidation = {
  reviewProfile: { params: DriverProfileIdParamSchema, body: ReviewKycSchema },
  submitDocuments: { body: submitKycDocumentsSchema },
  reviewDocument: { body: reviewDocumentBodySchema },
  getPendingKyc: { query: PendingKycQuerySchema },
  acceptUser: { params: UserIdParamSchema },
  rejectUser: { params: UserIdParamSchema, body: RejectUserBodySchema },
  blockUser: { params: UserIdParamSchema },
  unblockUser: { params: UserIdParamSchema },
};
