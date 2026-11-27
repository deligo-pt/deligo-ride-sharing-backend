import { EmailOnlySignupInput } from './auth.validation';

export type SignupInput = EmailOnlySignupInput;

export type CustomerSignupInput = {
  referralCode?: string | undefined;
  email?: string | undefined;
  contactNumber?: string | undefined;
};

export interface CustomerSignupRedisSession {
  payload: {
    email?: string;
    contactNumber?: string;
    referralCode: string | null;
    referrerId: string | null;
    role: 'CUSTOMER' | 'DRIVER' | 'FLEET_MANAGER';
  };
  otp: {
    codeHash: string;
    channel: 'EMAIL' | 'PHONE';
    expiresAt: number;
  };
  resendCount: number;
  lastSentAt: number;
}

export interface SignupRedisSession {
  payload: {
    email?: string;
    contactNumber?: string;
    passwordHash: string;
    referralCode: string | null;
    referrerId: string | null;
    role: 'CUSTOMER' | 'DRIVER' | 'FLEET_MANAGER';
  };
  otp: {
    codeHash: string;
    channel: 'EMAIL' | 'PHONE';
    expiresAt: number;
  };
  resendCount: number;
  lastSentAt: number;
}

export interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SanitizedUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  profilePicture: string | null;
  preferredLanguage: string | null;
  referralCode: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  createdAt: Date;
}

export interface SocialUserProfile {
  provider: 'GOOGLE' | 'FACEBOOK' | 'APPLE';
  providerAccountId: string;
  email: string | null;
  isEmailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  profilePicture: string | null;
}

export interface SocialAuthOptions {
  referralCode?: string | null;
  preferredLanguage?: 'EN' | 'PT';
  rememberMe?: boolean;
}

export interface GooglePayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export interface ResetPasswordPayload {
  email: string;
}

export interface ResetOtpSession {
  userId: string;
  otpHash: string;
  channel: 'EMAIL';
  target: string;
  attempts: number;
}
