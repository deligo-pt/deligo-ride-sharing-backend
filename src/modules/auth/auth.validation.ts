import { z } from 'zod';
import { normalizePhoneE164 } from '../../utils/phone';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const emailIdentifier = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .transform((email) => ({
    email,
    phone: null as string | null,
    otpChannel: 'EMAIL' as const,
  }));

const phoneIdentifier = z
  .string()
  .trim()
  .transform((val, ctx) => {
    if (!val.replace(/[\s\-()]/g, '').startsWith('+')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Phone number must include country code (e.g., +351... or +880...)',
      });
      return z.NEVER;
    }

    const phone = normalizePhoneE164(val);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Invalid phone number' });
      return z.NEVER;
    }

    return {
      email: null as string | null,
      phone,
      otpChannel: 'PHONE' as const,
    };
  });

const identifierSchema = z.union([emailIdentifier, phoneIdentifier], {
  error: 'Must be a valid email address or phone number with country code',
});

export const InitiateSignupSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required').trim(),
    lastName: z.string().min(1, 'Last name is required').trim(),
    identifier: identifierSchema,
    password: passwordSchema,
    preferredLanguage: z.enum(['EN', 'PT']).default('EN'),
    referralCode: z.string().trim().optional(),
  })
  .transform(({ identifier, ...rest }) => ({
    ...rest,
    email: identifier.email,
    phone: identifier.phone,
    otpChannel: identifier.otpChannel,
  }));

export type InitiateSignupInput = z.infer<typeof InitiateSignupSchema>;

export const EmailOnlySignupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    password: passwordSchema,
    preferredLanguage: z.enum(['EN', 'PT']).default('EN'),
    referralCode: z.string().trim().optional(),
  })
  .transform(({ email, ...rest }) => ({
    ...rest,
    firstName: null as string | null,
    lastName: null as string | null,
    email,
    phone: null as string | null,
    otpChannel: 'EMAIL' as const,
  }));

export type EmailOnlySignupInput = z.infer<typeof EmailOnlySignupSchema>;

const ResendOtpSchema = z.object({
  signupSessionId: z.string().uuid('Invalid signupSessionId format'),
  channel: z.enum(['EMAIL', 'PHONE']).optional(),
});

export type ResendOtpInput = z.infer<typeof ResendOtpSchema>;

const VerifyOtpSchema = z.object({
  includeRefreshToken: z.boolean().optional(),
  signupSessionId: z.string().uuid('Invalid signupSessionId format'),
  otp: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only numbers'),
});

export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;

const LoginSchema = z.object({
  includeRefreshToken: z.boolean().optional(),
  identifier: z.string().min(1, 'Email or phone number is required').trim(),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof LoginSchema>;

const RefreshTokenSchema = z.object({
  includeRefreshToken: z.boolean().optional(),
  refreshToken: z.string().optional(),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

const GoogleLoginSchema = z.object({
  includeRefreshToken: z.boolean().optional(),
  idToken: z.string().min(1, 'Google ID token is required'),
  referralCode: z.string().trim().optional(),
  preferredLanguage: z.enum(['EN', 'PT']).optional().default('EN'),
  rememberMe: z.boolean().optional().default(true),
});

export type GoogleLoginInput = z.infer<typeof GoogleLoginSchema>;

const FacebookLoginSchema = z.object({
  includeRefreshToken: z.boolean().optional(),
  accessToken: z.string().min(1, 'Facebook access token is required'),
  referralCode: z.string().trim().optional(),
  preferredLanguage: z.enum(['EN', 'PT']).optional().default('EN'),
  rememberMe: z.boolean().optional().default(true),
});

export type FacebookLoginInput = z.infer<typeof FacebookLoginSchema>;

const AppleLoginSchema = z.object({
  includeRefreshToken: z.boolean().optional(),
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

const CreateAdminSchema = z.object({
  firstName: z.string().min(1, 'First name is required').trim(),
  lastName: z.string().min(1, 'Last name is required').trim(),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']).default('ADMIN'),
});

export type CreateAdminInput = z.infer<typeof CreateAdminSchema>;

const SetAdminPasswordSchema = z.object({
  token: z.string().min(1, 'Invitation token is required').trim(),
  password: passwordSchema,
});

export type SetAdminPasswordInput = z.infer<typeof SetAdminPasswordSchema>;

export const AuthValidation = {
  initiateSignup: { body: InitiateSignupSchema },
  emailOnlySignup: { body: EmailOnlySignupSchema },
  resendOtp: { body: ResendOtpSchema },
  verifyOtp: { body: VerifyOtpSchema },
  login: { body: LoginSchema },
  googleLogin: { body: GoogleLoginSchema },
  facebookLogin: { body: FacebookLoginSchema },
  appleLogin: { body: AppleLoginSchema },
  createAdmin: { body: CreateAdminSchema },
  setAdminPassword: { body: SetAdminPasswordSchema },
  refreshToken: { body: z.preprocess((value) => value ?? {}, RefreshTokenSchema) },
};
