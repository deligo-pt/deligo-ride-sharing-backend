import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

const InitiateSignupSchema = z
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

const ResendOtpSchema = z.object({
  signupSessionId: z.string().uuid('Invalid signupSessionId format'),
  channel: z.enum(['EMAIL', 'PHONE']).optional(),
});

export type ResendOtpInput = z.infer<typeof ResendOtpSchema>;

const VerifyOtpSchema = z.object({
  signupSessionId: z.string().uuid('Invalid signupSessionId format'),
  otp: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only numbers'),
});

export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;

const LoginSchema = z.object({
  identifier: z.string().min(1, 'Email or phone number is required').trim(),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof LoginSchema>;

const RefreshTokenSchema = z.object({
  refreshToken: z.string().optional(),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

const GoogleLoginSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
  referralCode: z.string().trim().optional(),
  preferredLanguage: z.enum(['EN', 'PT']).optional().default('EN'),
  rememberMe: z.boolean().optional().default(true),
});

export type GoogleLoginInput = z.infer<typeof GoogleLoginSchema>;

const FacebookLoginSchema = z.object({
  accessToken: z.string().min(1, 'Facebook access token is required'),
  referralCode: z.string().trim().optional(),
  preferredLanguage: z.enum(['EN', 'PT']).optional().default('EN'),
  rememberMe: z.boolean().optional().default(true),
});

export type FacebookLoginInput = z.infer<typeof FacebookLoginSchema>;

const AppleLoginSchema = z.object({
  idToken: z.string().min(1, 'Apple ID token is required'),
  user: z
    .object({
      firstName: z.string().trim().optional(),
      lastName: z.string().trim().optional(),
    })
    .optional(),
  referralCode: z.string().trim().optional(),
  preferredLanguage: z.enum(['EN', 'PT']).optional().default('EN'),
  rememberMe: z.boolean().optional().default(true),
});

export type AppleLoginInput = z.infer<typeof AppleLoginSchema>;

export const AuthValidation = {
  initiateSignup: { body: InitiateSignupSchema },
  resendOtp: { body: ResendOtpSchema },
  verifyOtp: { body: VerifyOtpSchema },
  login: { body: LoginSchema },
  googleLogin: { body: GoogleLoginSchema },
  facebookLogin: { body: FacebookLoginSchema },
  appleLogin: { body: AppleLoginSchema },
  // Cookie-only clients send no JSON body, so an absent body is treated as {}.
  refreshToken: { body: z.preprocess((value) => value ?? {}, RefreshTokenSchema) },
};
