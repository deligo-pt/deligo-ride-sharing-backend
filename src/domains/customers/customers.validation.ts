import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// PRD 3.10 — User Registration Validation
// ─────────────────────────────────────────────────────────────────────────────

export const CreateUserSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(7).max(20),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  role: z.enum(['CUSTOMER', 'DRIVER']).default('CUSTOMER'),
  /// Optional referral code supplied by the new user at sign-up.
  referredByCode: z.string().trim().toUpperCase().optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// PRD 5.6 — Admin Referral Campaign Validation
// ─────────────────────────────────────────────────────────────────────────────

export const UpdateReferralCampaignSchema = z.object({
  referrerBonusAmount: z.number().positive().optional(),
  refereeBonusAmount: z.number().positive().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) =>
    data.referrerBonusAmount !== undefined ||
    data.refereeBonusAmount !== undefined ||
    data.isActive !== undefined,
  { message: 'At least one field must be provided.' },
);

export type UpdateReferralCampaignInput = z.infer<typeof UpdateReferralCampaignSchema>;
