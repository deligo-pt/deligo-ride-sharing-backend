import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Validation Schemas  —  PRD 5.x
// ─────────────────────────────────────────────────────────────────────────────

// ─── PATCH /admin/kyc/:driverProfileId ────────────────────────────────────────

export const ReviewKycSchema = z
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

// ─── PATCH /admin/kyc/:driverProfileId params ─────────────────────────────────

export const DriverProfileIdParamSchema = z.object({
  driverProfileId: z.string().uuid('driverProfileId must be a valid UUID'),
});

export type DriverProfileIdParam = z.infer<typeof DriverProfileIdParamSchema>;

// ─── GET /admin/users (paginated list) ────────────────────────────────────────

export const ListUsersQuerySchema = z
  .object({
    role: z.enum(['CUSTOMER', 'DRIVER']).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'DEACTIVATED']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  });

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

// ─── PATCH /admin/users/:userId/status ────────────────────────────────────────

export const UserIdParamSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
});

export const UpdateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED'], {
    error: 'status must be ACTIVE, SUSPENDED, or DEACTIVATED',
  }),
  reason: z.string().max(500).optional(),
});

export type UpdateUserStatusInput = z.infer<typeof UpdateUserStatusSchema>;
