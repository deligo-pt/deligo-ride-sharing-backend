import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const InitiateSignupSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required').trim(),
    lastName: z.string().min(1, 'Last name is required').trim(),
    email: z
      .string()
      .email('Invalid email address')
      .toLowerCase()
      .trim()
      .optional()
      .or(z.literal('')),
    phone: z
      .string()
      .min(6, 'Phone number must be at least 6 digits')
      .trim()
      .optional()
      .or(z.literal('')),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    preferredLanguage: z.enum(['EN', 'PT']).default('EN'),
    referralCode: z.string().trim().optional(),
    otpChannel: z.enum(['EMAIL', 'PHONE']).default('EMAIL'),
  })
  .superRefine((data, ctx) => {
    const hasEmail = Boolean(data.email && data.email.length > 0);
    const hasPhone = Boolean(data.phone && data.phone.length > 0);

    if (!hasEmail && !hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one of email or phone must be provided',
        path: ['email'],
      });
      return;
    }

    if (data.otpChannel === 'EMAIL' && !hasEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is required when otpChannel is EMAIL',
        path: ['email'],
      });
    }

    if (data.otpChannel === 'PHONE' && !hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone number is required when otpChannel is PHONE',
        path: ['phone'],
      });
    }
  });

export type InitiateSignupInput = z.infer<typeof InitiateSignupSchema>;

export const ResendOtpSchema = z.object({
  signupSessionId: z.string().uuid('Invalid signupSessionId format'),
  channel: z.enum(['EMAIL', 'PHONE']).optional(),
});

export type ResendOtpInput = z.infer<typeof ResendOtpSchema>;

export const VerifyOtpSchema = z.object({
  signupSessionId: z.string().uuid('Invalid signupSessionId format'),
  otp: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only numbers'),
});

export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;

export const LoginSchema = z.object({
  identifier: z.string().min(1, 'Email or phone number is required').trim(),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().optional(),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
