import { z } from 'zod';
import { normalizePortuguesePhone, PORTUGUESE_PHONE_MESSAGE } from '../../utils/phone';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const emailSchema = z.string().trim().toLowerCase().email('Invalid email address');

const contactNumberSchema = z
  .string()
  .trim()
  .transform((val, ctx) => {
    const phone = normalizePortuguesePhone(val);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: PORTUGUESE_PHONE_MESSAGE });
      return z.NEVER;
    }
    return phone;
  });

const contactFields = {
  email: emailSchema.optional(),
  contactNumber: contactNumberSchema.optional(),
};

type ContactFields = { email?: string; contactNumber?: string };

function addContactIssue(
  ctx: z.RefinementCtx,
  message: string,
  path: 'email' | 'contactNumber',
): void {
  ctx.addIssue({ code: 'custom', message, path: [path] });
}

/** XOR: exactly one of email / contactNumber. */
function requireExactlyOneContact(data: ContactFields, ctx: z.RefinementCtx): void {
  if (data.email && data.contactNumber) {
    addContactIssue(ctx, 'Provide either email or contactNumber, not both', 'contactNumber');
  } else if (!data.email && !data.contactNumber) {
    addContactIssue(ctx, 'Either email or contactNumber is required', 'email');
  }
}

/** Optional contact (OTP endpoints): at most one of email / contactNumber. */
function allowAtMostOneContact(data: ContactFields, ctx: z.RefinementCtx): void {
  if (data.email && data.contactNumber) {
    addContactIssue(ctx, 'Provide either email or contactNumber, not both', 'contactNumber');
  }
}

export const CustomerAuthRequestSchema = z
  .object({
    ...contactFields,
    referralCode: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.email && data.contactNumber) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide either email or contactNumber, not both',
        path: ['contactNumber'],
      });
    } else if (!data.email && !data.contactNumber) {
      ctx.addIssue({
        code: 'custom',
        message: 'Either email or contactNumber is required',
        path: ['email'],
      });
    }
  });

export type CustomerAuthRequestInput = z.infer<typeof CustomerAuthRequestSchema>;

export const CustomerAuthVerifySchema = z
  .object({
    authSessionId: z.string().uuid('Invalid session ID'),
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'OTP must be 6 digits'),
    ...contactFields,
  })
  .superRefine((data, ctx) => {
    if (data.email && data.contactNumber) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide either email or contactNumber, not both',
        path: ['contactNumber'],
      });
    } else if (!data.email && !data.contactNumber) {
      ctx.addIssue({
        code: 'custom',
        message: 'Either email or contactNumber is required',
        path: ['email'],
      });
    }
  });

export type CustomerAuthVerifyInput = z.infer<typeof CustomerAuthVerifySchema>;

export const InitiateSignupSchema = z
  .object({
    ...contactFields,
    password: passwordSchema,
    referralCode: z.string().trim().optional(),
  })
  .superRefine(requireExactlyOneContact);

export type InitiateSignupInput = z.infer<typeof InitiateSignupSchema>;

export const EmailOnlySignupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  referralCode: z.string().trim().optional(),
});

export type EmailOnlySignupInput = z.infer<typeof EmailOnlySignupSchema>;

const ResendOtpSchema = z
  .object({
    signupSessionId: z.string().uuid('Invalid signupSessionId format'),
    ...contactFields,
  })
  .superRefine(allowAtMostOneContact);

export type ResendOtpInput = z.infer<typeof ResendOtpSchema>;

const VerifyOtpSchema = z
  .object({
    includeRefreshToken: z.boolean().optional(),
    signupSessionId: z.string().uuid('Invalid signupSessionId format'),
    ...contactFields,
    otp: z
      .string()
      .length(6, 'OTP must be exactly 6 digits')
      .regex(/^\d{6}$/, 'OTP must contain only numbers'),
  })
  .superRefine(allowAtMostOneContact);

export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;

const LoginSchema = z
  .object({
    includeRefreshToken: z.boolean().optional(),
    ...contactFields,
    password: z.string().min(1, 'Password is required'),
    rememberMe: z.boolean().optional().default(false),
  })
  .superRefine(requireExactlyOneContact);

export type LoginInput = z.infer<typeof LoginSchema>;

const LogoutSchema = z.object({
  refreshToken: z.string().optional(),
  /** This device's FCM token: when sent, only that token is cleared (precise device logout). */
  fcmToken: z.string().min(1).optional(),
  /** Default true: the user's push token is cleared on logout. Send false to keep receiving pushes. */
  clearFcmToken: z.boolean().optional(),
});

export type LogoutInput = z.infer<typeof LogoutSchema>;

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
  CustomerAuthRequestSchema: { body: CustomerAuthRequestSchema },
  CustomerAuthVerifySchema: { body: CustomerAuthVerifySchema },
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
  logout: { body: z.preprocess((value) => value ?? {}, LogoutSchema) },
};
