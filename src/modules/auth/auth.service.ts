import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { config } from '../../config';
import { redis } from '../../utils/redis';
import { sendEmail } from '../../utils/email.service';
import { sendBulkGateSms } from '../../utils/bulkgate';
import { disconnectSessionSockets, disconnectUserSockets } from '../../sockets/socket.control';
import { revokeSessionAccessTokens, revokeUserAccessTokens } from '../../utils/revocation';
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
} from '../../utils/errors';
import {
  InitiateSignupInput,
  LoginInput,
  ResendOtpInput,
  VerifyOtpInput,
  GoogleLoginInput,
  FacebookLoginInput,
  AppleLoginInput,
} from './auth.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Service
//
// Handles Signup (Redis session + atomic OTP attempts -> Atomic Postgres write),
// Login (Credentials, timing attack & enumeration prevention, multi-device sessions),
// Social Auth (Google, Facebook, Apple with Pre-Account Takeover protection),
// Token Refresh (Atomic session rotation & breach detection),
// and Logout (Access token JTI blacklist + Session revocation).
// ─────────────────────────────────────────────────────────────────────────────

interface SignupRedisSession {
  payload: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    passwordHash: string;
    preferredLanguage: 'EN' | 'PT';
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

// Dummy bcrypt hash used for constant-time comparison to prevent timing-based user enumeration
const DUMMY_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK8.';
const EXTERNAL_API_TIMEOUT_MS = 5000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_RESENDS = 3;
const OTP_RESEND_COOLDOWN_MS = 60_000;

export const googleAuthClient = new OAuth2Client();
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function hashSha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signJwt(payload: object, secret: string, expiresIn: string | number): string {
  const options: jwt.SignOptions = {
    expiresIn: expiresIn as unknown as jwt.SignOptions['expiresIn'],
  };
  return jwt.sign(payload, secret, options);
}

function maskTarget(
  channel: 'EMAIL' | 'PHONE',
  email?: string | null,
  phone?: string | null,
): string {
  if (channel === 'EMAIL' && email) {
    const [localPart, domain] = email.split('@');
    if (!domain) return email;
    if (localPart.length <= 2) return `${localPart[0]}***@${domain}`;
    return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`;
  }
  if (channel === 'PHONE' && phone) {
    if (phone.length <= 4) return '***' + phone;
    return phone.slice(0, 3) + '***' + phone.slice(-2);
  }
  return '***';
}

export function sanitizeUser(user: {
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
}): SanitizedUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    profilePicture: user.profilePicture,
    preferredLanguage: user.preferredLanguage,
    referralCode: user.referralCode,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    createdAt: user.createdAt,
  };
}

/**
 * Generates a unique referral code for a newly registered user.
 * Retries up to 5 times against DB collisions, with a timestamp-based fallback.
 */
export async function generateUniqueReferralCode(): Promise<string> {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = 'DL';
    for (let i = 0; i < 6; i++) {
      code += chars[crypto.randomInt(0, chars.length)];
    }
    const existing = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!existing) {
      return code;
    }
  }
  return `DL${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/**
 * Issues a new Access + Refresh token pair and persists the hashed refresh token
 * as a dedicated Session row in PostgreSQL.
 */
async function issueSessionAndTokens(
  user: {
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
  },
  rememberMe: boolean,
  clientInfo: ClientInfo,
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> {
  const durationDays = rememberMe ? 30 : 1;
  const refreshExpiresInStr = rememberMe
    ? config.jwt.refreshExpiresInRemember || '30d'
    : config.jwt.refreshExpiresInDefault || '1d';
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  const sessionId = crypto.randomUUID();
  const jti = crypto.randomUUID();

  const accessToken = signJwt(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      jti,
    },
    config.jwt.accessSecret,
    config.jwt.accessExpiresIn || '15m',
  );

  const refreshToken = signJwt(
    {
      sub: user.id,
      sessionId,
      jti: crypto.randomUUID(),
    },
    config.jwt.refreshSecret,
    refreshExpiresInStr,
  );

  const tokenHash = hashSha256(refreshToken);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash,
      rememberMe: Boolean(rememberMe),
      userAgent: clientInfo.userAgent || null,
      ipAddress: clientInfo.ipAddress || null,
      expiresAt,
      isRevoked: false,
    },
  });

  return {
    user: sanitizeUser(user),
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: 900,
    },
  };
}

/**
 * Dispatches an OTP via Email or BulkGate SMS using dynamic expiry configuration.
 */
async function dispatchOtp(
  channel: 'EMAIL' | 'PHONE',
  otp: string,
  targetEmail: string | null,
  targetPhone: string | null,
  firstName: string,
  language: 'EN' | 'PT',
): Promise<void> {
  const expiryMinutes = Math.max(1, Math.round(config.otp.expiresInSeconds / 60));

  if (channel === 'EMAIL' && targetEmail) {
    await sendEmail({
      to: targetEmail,
      subject: language === 'PT' ? 'Código de Verificação Deligo' : 'Deligo Verification Code',
      template: 'otp-verification',
      data: {
        name: firstName,
        otpCode: otp,
        expiryMinutes,
        preferredLanguage: language,
      },
    });
  } else if (channel === 'PHONE' && targetPhone) {
    const text =
      language === 'PT'
        ? `Seu codigo de verificacao Deligo e: ${otp}. Valido por ${expiryMinutes} minutos.`
        : `Your Deligo verification code is: ${otp}. Valid for ${expiryMinutes} minutes.`;
    await sendBulkGateSms(targetPhone, text);
  }
}

/**
 * Fires a non-blocking welcome email with safe error catching so unhandled
 * rejections never crash the Node.js process.
 */
function sendWelcomeEmailAsync(user: {
  email: string | null;
  firstName: string | null;
  referralCode: string;
  preferredLanguage: string | null;
}): void {
  if (!user.email) return;

  void sendEmail({
    to: user.email,
    subject: user.preferredLanguage === 'PT' ? 'Bem-vindo ao Deligo!' : 'Welcome to Deligo!',
    template: 'welcome',
    data: {
      name: user.firstName,
      referralCode: user.referralCode,
      preferredLanguage: user.preferredLanguage,
    },
  }).catch((err: unknown) => {
    console.error('[AuthService] Failed to send welcome email:', err);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Token Verification
// ─────────────────────────────────────────────────────────────────────────────

export async function verifyGoogleIdToken(idToken: string): Promise<GooglePayload> {
  try {
    const audiences = config.google.audiences;
    if (!audiences || audiences.length === 0) {
      throw new UnauthorizedError('Google authentication audiences are not configured');
    }

    const ticket = await googleAuthClient.verifyIdToken({
      idToken,
      audience: audiences.length === 1 ? audiences[0] : audiences,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedError(
        'Google account email is not verified or token payload is incomplete',
      );
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase().trim(),
      email_verified: payload.email_verified,
      name: payload.name,
      given_name: payload.given_name,
      family_name: payload.family_name,
      picture: payload.picture,
    };
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Google token verification failed';
    throw new UnauthorizedError(`Invalid Google ID token: ${message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Signup Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function initiateSignup(
  input: InitiateSignupInput,
  role: 'CUSTOMER' | 'DRIVER' | 'FLEET_MANAGER' = 'CUSTOMER',
): Promise<{
  signupSessionId: string;
  channel: 'EMAIL' | 'PHONE';
  maskedTarget: string;
  expiresIn: number;
}> {
  const normalizedEmail =
    input.email && input.email.length > 0 ? input.email.toLowerCase().trim() : null;
  const normalizedPhone = input.phone && input.phone.length > 0 ? input.phone.trim() : null;

  // Verify email does not exist
  if (normalizedEmail) {
    const existing = await prisma.user.findFirst({
      where: { email: normalizedEmail, isDeleted: false },
    });
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }
  }

  // Verify phone does not exist
  if (normalizedPhone) {
    const existing = await prisma.user.findFirst({
      where: { phone: normalizedPhone, isDeleted: false },
    });
    if (existing) {
      throw new ConflictError('A user with this phone number already exists');
    }
  }

  // Validate referrer's referralCode if provided
  let referrerId: string | null = null;
  if (input.referralCode) {
    const code = input.referralCode.trim().toUpperCase();
    const referrer = await prisma.user.findUnique({
      where: { referralCode: code },
    });
    if (!referrer || referrer.isDeleted) {
      throw new BadRequestError('Invalid referral code provided');
    }
    referrerId = referrer.id;
  }

  // Hash password before caching in Redis
  const passwordHash = await bcrypt.hash(input.password, config.bcrypt.saltRounds);

  // Generate 6-digit OTP & store only its SHA-256 hash
  const rawOtp = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashSha256(rawOtp);
  const signupSessionId = crypto.randomUUID();

  const now = Date.now();
  const expiresAt = now + config.otp.expiresInSeconds * 1000;

  const sessionData: SignupRedisSession = {
    payload: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: normalizedEmail,
      phone: normalizedPhone,
      passwordHash,
      preferredLanguage: input.preferredLanguage,
      referralCode: input.referralCode?.trim().toUpperCase() || null,
      referrerId,
      role,
    },
    otp: {
      codeHash,
      channel: input.otpChannel,
      expiresAt,
    },
    resendCount: 0,
    lastSentAt: now,
  };

  // Store temporary signup session in Redis with TTL
  const redisKey = `signup:session:${signupSessionId}`;
  await redis.set(redisKey, JSON.stringify(sessionData), 'EX', config.otp.signupSessionTtlSeconds);

  // Dispatch OTP
  await dispatchOtp(
    input.otpChannel,
    rawOtp,
    normalizedEmail,
    normalizedPhone,
    input.firstName,
    input.preferredLanguage,
  );

  return {
    signupSessionId,
    channel: input.otpChannel,
    maskedTarget: maskTarget(input.otpChannel, normalizedEmail, normalizedPhone),
    expiresIn: config.otp.expiresInSeconds,
  };
}

export async function resendSignupOtp(input: ResendOtpInput): Promise<{
  signupSessionId: string;
  channel: 'EMAIL' | 'PHONE';
  maskedTarget: string;
  expiresIn: number;
}> {
  const redisKey = `signup:session:${input.signupSessionId}`;
  const attemptsKey = `signup:otp:attempts:${input.signupSessionId}`;
  const rawData = await redis.get(redisKey);

  if (!rawData) {
    throw new NotFoundError('Signup session expired or not found. Please restart signup.');
  }

  const session = JSON.parse(rawData) as SignupRedisSession;
  const targetChannel = input.channel || session.otp.channel;

  if (targetChannel === 'EMAIL' && !session.payload.email) {
    throw new BadRequestError(
      'Cannot send OTP via EMAIL because no email was provided during registration',
    );
  }

  if (targetChannel === 'PHONE' && !session.payload.phone) {
    throw new BadRequestError(
      'Cannot send OTP via PHONE because no phone number was provided during registration',
    );
  }

  const now = Date.now();
  const elapsed = now - session.lastSentAt;

  // Enforce cooldown
  if (elapsed < OTP_RESEND_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
    throw new RateLimitError(`Please wait ${remainingSeconds} seconds before requesting a new OTP`);
  }

  // Enforce max resend limit
  if (session.resendCount >= MAX_OTP_RESENDS) {
    throw new RateLimitError(
      'Maximum OTP resend limit reached for this session. Please restart registration.',
    );
  }

  // Generate new OTP & invalidate previous one
  const rawOtp = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashSha256(rawOtp);

  session.otp = {
    codeHash,
    channel: targetChannel,
    expiresAt: now + config.otp.expiresInSeconds * 1000,
  };
  session.resendCount += 1;
  session.lastSentAt = now;

  // Preserve remaining TTL in Redis
  const ttl = await redis.ttl(redisKey);
  await redis.set(
    redisKey,
    JSON.stringify(session),
    'EX',
    ttl > 0 ? ttl : config.otp.signupSessionTtlSeconds,
  );

  // Reset atomic attempt counter for the newly issued OTP
  await redis.del(attemptsKey);

  await dispatchOtp(
    targetChannel,
    rawOtp,
    session.payload.email,
    session.payload.phone,
    session.payload.firstName,
    session.payload.preferredLanguage,
  );

  return {
    signupSessionId: input.signupSessionId,
    channel: targetChannel,
    maskedTarget: maskTarget(targetChannel, session.payload.email, session.payload.phone),
    expiresIn: config.otp.expiresInSeconds,
  };
}

export async function verifySignupOtp(
  input: VerifyOtpInput,
  clientInfo: ClientInfo,
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> {
  const redisKey = `signup:session:${input.signupSessionId}`;
  const attemptsKey = `signup:otp:attempts:${input.signupSessionId}`;
  const rawData = await redis.get(redisKey);

  if (!rawData) {
    throw new NotFoundError('Signup session expired or not found. Please restart signup.');
  }

  const session = JSON.parse(rawData) as SignupRedisSession;

  // Check OTP expiration
  if (Date.now() > session.otp.expiresAt) {
    throw new BadRequestError('Verification code has expired. Please request a new one.');
  }

  // Timing-safe OTP comparison
  const inputHash = hashSha256(input.otp);
  const expectedHash = session.otp.codeHash;
  const isMatch =
    inputHash.length === expectedHash.length &&
    crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(expectedHash));

  if (!isMatch) {
    // Atomic INCR prevents parallel brute-force race conditions
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) {
      await redis.expire(attemptsKey, config.otp.signupSessionTtlSeconds);
    }

    if (attempts >= MAX_OTP_ATTEMPTS) {
      await redis.del(redisKey, attemptsKey);
      throw new RateLimitError(
        'Too many invalid attempts. Signup session terminated for security.',
      );
    }

    throw new BadRequestError('Invalid verification code', {
      remainingAttempts: MAX_OTP_ATTEMPTS - attempts,
    });
  }

  // Generate a brand-new unique referral code for this new user
  const ownReferralCode = await generateUniqueReferralCode();

  let createdUser;
  try {
    createdUser = await prisma.$transaction(async (tx) => {
      // 1. Create User
      const user = await tx.user.create({
        data: {
          email: session.payload.email,
          phone: session.payload.phone,
          firstName: session.payload.firstName,
          lastName: session.payload.lastName,
          role: session.payload.role || 'CUSTOMER',
          status: 'ACTIVE',
          preferredLanguage: session.payload.preferredLanguage,
          referralCode: ownReferralCode,
          referrerId: session.payload.referrerId,
          isEmailVerified: session.otp.channel === 'EMAIL',
          isPhoneVerified: session.otp.channel === 'PHONE',
        },
      });

      // 2. Create Credentials Account
      await tx.account.create({
        data: {
          userId: user.id,
          provider: 'CREDENTIALS',
          providerAccountId: user.id,
          email: session.payload.email,
          phone: session.payload.phone,
          passwordHash: session.payload.passwordHash,
        },
      });

      // 3. Conditionally create CustomerProfile, DriverProfile, or FleetManagerProfile based on role
      if (session.payload.role === 'DRIVER') {
        await tx.driverProfile.create({
          data: {
            userId: user.id,
            kycStatus: 'NOT_SUBMITTED',
            isAvailable: false,
          },
        });
      } else if (session.payload.role === 'FLEET_MANAGER') {
        await tx.fleetManagerProfile.create({
          data: {
            userId: user.id,
            verificationStatus: 'PENDING_VERIFICATION',
          },
        });
      } else {
        await tx.customerProfile.create({
          data: { userId: user.id },
        });
      }

      // 4. Create Wallet
      await tx.wallet.create({
        data: {
          userId: user.id,
          balance: 0,
          currency: 'USD',
        },
      });

      return user;
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
      throw new ConflictError(`A user with this ${target} already exists`);
    }
    throw err;
  }

  // Clean up temporary Redis keys
  await redis.del(redisKey, attemptsKey);

  // Non-blocking welcome email
  sendWelcomeEmailAsync(createdUser);

  // Reuse centralized session & token issuer
  return issueSessionAndTokens(createdUser, false, clientInfo);
}

// ─────────────────────────────────────────────────────────────────────────────
// Login & Social Auth Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function login(
  input: LoginInput,
  clientInfo: ClientInfo,
  allowedRoles?: ('CUSTOMER' | 'DRIVER' | 'ADMIN' | 'FLEET_MANAGER')[],
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> {
  const identifier = input.identifier.trim();

  // Find User by email OR phone
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identifier.toLowerCase() }, { phone: identifier }],
      isDeleted: false,
    },
    include: {
      account: {
        where: { isDeleted: false },
      },
    },
  });

  // Timing attack prevention if user does not exist
  if (!user) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid credentials');
  }

  const credentialsAccount = user.account.find((acc) => acc.provider === 'CREDENTIALS');

  // Prevent account/provider enumeration by returning a generic error in constant time
  if (!credentialsAccount || !credentialsAccount.passwordHash) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid credentials');
  }

  const passwordMatch = await bcrypt.compare(input.password, credentialsAccount.passwordHash);
  if (!passwordMatch) {
    throw new UnauthorizedError('Invalid credentials');
  }

  // Role authorization check (after password verification to prevent user/role enumeration)
  if (
    allowedRoles &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(user.role)
  ) {
    throw new ForbiddenError('This account is not authorized to sign in to this app.');
  }

  if (user.status === 'SUSPENDED') {
    throw new ForbiddenError('Your account has been suspended. Please contact customer support.');
  }
  if (user.status === 'DEACTIVATED') {
    throw new ForbiddenError('Your account has been deactivated.');
  }
  if (user.status === 'PENDING_VERIFICATION') {
    throw new ForbiddenError('Account verification is pending.');
  }

  return issueSessionAndTokens(user, Boolean(input.rememberMe), clientInfo);
}

export async function handleSocialAuth(
  profile: SocialUserProfile,
  options: SocialAuthOptions,
  clientInfo: ClientInfo,
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> {
  const rememberMe = options.rememberMe ?? true;

  // 1. Case A — Existing active Account for (provider, providerAccountId)
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    include: {
      user: true,
    },
  });

  if (existingAccount && !existingAccount.isDeleted) {
    const user = existingAccount.user;
    if (!user || user.isDeleted) {
      throw new UnauthorizedError(
        `User account associated with this ${profile.provider} login has been deleted`,
      );
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenError('Your account has been suspended. Please contact customer support.');
    }
    if (user.status === 'DEACTIVATED') {
      throw new ForbiddenError('Your account has been deactivated.');
    }
    if (user.status === 'PENDING_VERIFICATION') {
      throw new ForbiddenError('Account verification is pending.');
    }

    return issueSessionAndTokens(user, rememberMe, clientInfo);
  }

  // 2. Case B — Existing User by verified Email, not yet linked to this provider
  if (profile.email && profile.isEmailVerified) {
    const existingUserByEmail = await prisma.user.findFirst({
      where: {
        email: profile.email,
        isDeleted: false,
      },
      include: {
        account: {
          where: { isDeleted: false },
        },
      },
    });

    if (existingUserByEmail) {
      if (existingUserByEmail.status === 'SUSPENDED') {
        throw new ForbiddenError(
          'Your account has been suspended. Please contact customer support.',
        );
      }
      if (existingUserByEmail.status === 'DEACTIVATED') {
        throw new ForbiddenError('Your account has been deactivated.');
      }

      // Pre-Account Takeover Protection:
      // Links social provider and soft-deletes any unverified CREDENTIALS account
      const updatedUser = await prisma.$transaction(async (tx) => {
        await tx.account.upsert({
          where: {
            provider_providerAccountId: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
            },
          },
          create: {
            userId: existingUserByEmail.id,
            provider: profile.provider,
            providerAccountId: profile.providerAccountId,
            email: profile.email,
          },
          update: {
            userId: existingUserByEmail.id,
            email: profile.email,
            isDeleted: false,
            deletedAt: null,
          },
        });

        const userUpdates: Prisma.UserUpdateInput = {};

        if (!existingUserByEmail.isEmailVerified) {
          userUpdates.isEmailVerified = true;
          await tx.account.updateMany({
            where: {
              userId: existingUserByEmail.id,
              provider: 'CREDENTIALS',
            },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
            },
          });
        }

        if (existingUserByEmail.status === 'PENDING_VERIFICATION') {
          userUpdates.status = 'ACTIVE';
        }

        if (!existingUserByEmail.profilePicture && profile.profilePicture) {
          userUpdates.profilePicture = profile.profilePicture;
        }

        if (Object.keys(userUpdates).length > 0) {
          return tx.user.update({
            where: { id: existingUserByEmail.id },
            data: userUpdates,
          });
        }

        return existingUserByEmail;
      });

      return issueSessionAndTokens(updatedUser, rememberMe, clientInfo);
    }
  }

  // 3. Case C — Brand New User (Neither Social Account nor Verified Email Exists)
  let referrerId: string | null = null;
  if (options.referralCode) {
    const code = options.referralCode.trim().toUpperCase();
    const referrer = await prisma.user.findUnique({
      where: { referralCode: code },
    });
    if (!referrer || referrer.isDeleted) {
      throw new BadRequestError('Invalid referral code provided');
    }
    referrerId = referrer.id;
  }

  const ownReferralCode = await generateUniqueReferralCode();
  const firstName = profile.firstName || 'User';
  const lastName = profile.lastName || '';

  let newUser;
  try {
    newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: profile.email || null,
          firstName,
          lastName,
          profilePicture: profile.profilePicture || null,
          preferredLanguage: options.preferredLanguage || 'EN',
          role: 'CUSTOMER',
          status: 'ACTIVE',
          referralCode: ownReferralCode,
          referrerId,
          isEmailVerified: profile.isEmailVerified,
          isPhoneVerified: false,
        },
      });

      // Upsert handles previously soft-deleted social accounts without throwing P2002
      await tx.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: profile.provider,
            providerAccountId: profile.providerAccountId,
          },
        },
        create: {
          userId: user.id,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
          email: profile.email || null,
        },
        update: {
          userId: user.id,
          email: profile.email || null,
          isDeleted: false,
          deletedAt: null,
        },
      });

      await tx.customerProfile.create({
        data: { userId: user.id },
      });

      await tx.wallet.create({
        data: {
          userId: user.id,
          balance: 0,
          currency: 'USD',
        },
      });

      return user;
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
      throw new ConflictError(`A user with this ${target} already exists`);
    }
    throw err;
  }

  sendWelcomeEmailAsync(newUser);

  return issueSessionAndTokens(newUser, rememberMe, clientInfo);
}

export async function googleLogin(
  input: GoogleLoginInput,
  clientInfo: ClientInfo,
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> {
  const googlePayload = await verifyGoogleIdToken(input.idToken);
  const firstName =
    googlePayload.given_name || (googlePayload.name ? googlePayload.name.split(' ')[0] : 'User');
  const lastName =
    googlePayload.family_name ||
    (googlePayload.name && googlePayload.name.split(' ').length > 1
      ? googlePayload.name.split(' ').slice(1).join(' ')
      : '');

  return handleSocialAuth(
    {
      provider: 'GOOGLE',
      providerAccountId: googlePayload.sub,
      email: googlePayload.email,
      isEmailVerified: googlePayload.email_verified,
      firstName,
      lastName,
      profilePicture: googlePayload.picture || null,
    },
    {
      referralCode: input.referralCode,
      preferredLanguage: input.preferredLanguage,
      rememberMe: input.rememberMe,
    },
    clientInfo,
  );
}

export async function facebookLogin(
  input: FacebookLoginInput,
  clientInfo: ClientInfo,
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> {
  const appId = config.facebook.appId;
  const appSecret = config.facebook.appSecret;

  if (!appId || !appSecret) {
    throw new BadRequestError('Facebook authentication is not configured on the server');
  }

  // 1. Verify Facebook Access Token via Graph API debug_token (with timeout)
  const appAccessToken = `${appId}|${appSecret}`;
  const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(
    input.accessToken,
  )}&access_token=${encodeURIComponent(appAccessToken)}`;

  let debugRes: globalThis.Response;
  try {
    debugRes = await fetch(debugUrl, {
      signal: AbortSignal.timeout(EXTERNAL_API_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    throw new UnauthorizedError(
      `Failed to reach Facebook verification service: ${err instanceof Error ? err.message : 'Network error'}`,
    );
  }

  const debugData = (await debugRes.json().catch(() => ({}))) as {
    data?: {
      is_valid?: boolean;
      app_id?: string;
      user_id?: string;
      error?: { message?: string };
    };
    error?: { message?: string };
  };

  if (!debugRes.ok || !debugData?.data?.is_valid || debugData.data.app_id !== appId) {
    const errorMsg =
      debugData?.data?.error?.message ||
      debugData?.error?.message ||
      'Facebook access token is invalid or does not belong to this application';
    throw new UnauthorizedError(`Facebook token verification failed: ${errorMsg}`);
  }

  const facebookUserId = debugData.data.user_id;
  if (!facebookUserId) {
    throw new UnauthorizedError('Facebook token did not yield a valid user ID');
  }

  // 2. Fetch User Profile via Graph API /me (with timeout)
  const meUrl = `https://graph.facebook.com/v21.0/me?fields=id,email,first_name,last_name,picture.type(large)&access_token=${encodeURIComponent(
    input.accessToken,
  )}`;

  let meRes: globalThis.Response;
  try {
    meRes = await fetch(meUrl, {
      signal: AbortSignal.timeout(EXTERNAL_API_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    throw new UnauthorizedError(
      `Failed to fetch Facebook user profile: ${err instanceof Error ? err.message : 'Network error'}`,
    );
  }

  const meData = (await meRes.json().catch(() => ({}))) as {
    id?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    picture?: {
      data?: {
        url?: string;
      };
    };
    error?: { message?: string };
  };

  if (!meRes.ok || !meData?.id) {
    const errorMsg = meData?.error?.message || 'Unable to retrieve Facebook user profile';
    throw new UnauthorizedError(`Failed to fetch Facebook user profile: ${errorMsg}`);
  }

  const email = meData.email ? meData.email.toLowerCase().trim() : null;
  const isEmailVerified = Boolean(email);

  return handleSocialAuth(
    {
      provider: 'FACEBOOK',
      providerAccountId: meData.id,
      email,
      isEmailVerified,
      firstName: meData.first_name || null,
      lastName: meData.last_name || null,
      profilePicture: meData.picture?.data?.url || null,
    },
    {
      referralCode: input.referralCode,
      preferredLanguage: input.preferredLanguage,
      rememberMe: input.rememberMe,
    },
    clientInfo,
  );
}

export async function appleLogin(
  input: AppleLoginInput,
  clientInfo: ClientInfo,
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> {
  let sub: string;
  let email: string | null = null;
  let isEmailVerified = false;
  let firstName = input.user?.firstName || null;
  let lastName = input.user?.lastName || null;

  // 1. Check for Demo Mode Token (non-production only)
  if (input.idToken.startsWith('demo_apple_token_')) {
    if (config.isProduction) {
      throw new UnauthorizedError('Apple demo tokens are forbidden in production');
    }
    if (!config.apple.demoMode) {
      throw new UnauthorizedError('Apple demo mode is disabled');
    }

    const suffix = input.idToken.slice('demo_apple_token_'.length).trim();
    if (suffix.startsWith('noemail')) {
      sub = `apple-demo-${suffix}`;
      email = null;
      isEmailVerified = false;
    } else if (suffix.includes('@')) {
      email = suffix.toLowerCase().trim();
      sub = `apple-demo-sub-${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
      isEmailVerified = true;
    } else if (suffix.length > 0) {
      sub = `apple-demo-${suffix}`;
      email = `${suffix.toLowerCase()}@demo.deligo.com`;
      isEmailVerified = true;
    } else {
      sub = 'apple-demo-user-1';
      email = 'apple-demo@deligo.com';
      isEmailVerified = true;
    }

    if (!firstName) firstName = 'Apple';
    if (!lastName) lastName = 'User';
  } else {
    // 2. Production Apple ID Token Verification with jose
    try {
      const audiences = config.apple.audiences;
      if (!audiences || audiences.length === 0) {
        throw new UnauthorizedError('Apple authentication audiences are not configured');
      }

      const { payload } = await jwtVerify(input.idToken, APPLE_JWKS, {
        issuer: 'https://appleid.apple.com',
        audience: audiences.length === 1 ? audiences[0] : audiences,
      });

      if (!payload.sub) {
        throw new UnauthorizedError('Apple ID token is missing the "sub" claim');
      }

      sub = payload.sub;

      if (typeof payload.email === 'string' && payload.email.length > 0) {
        email = payload.email.toLowerCase().trim();
        isEmailVerified = payload.email_verified === true || payload.email_verified === 'true';
      }
    } catch (err: unknown) {
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      throw new UnauthorizedError(
        `Invalid Apple ID token: ${err instanceof Error ? err.message : 'verification failed'}`,
      );
    }
  }

  return handleSocialAuth(
    {
      provider: 'APPLE',
      providerAccountId: sub,
      email,
      isEmailVerified,
      firstName,
      lastName,
      profilePicture: null,
    },
    {
      referralCode: input.referralCode,
      preferredLanguage: input.preferredLanguage,
      rememberMe: input.rememberMe,
    },
    clientInfo,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Refresh & Logout Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ tokens: AuthTokens; rememberMe: boolean }> {
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token is required');
  }

  const tokenHash = hashSha256(refreshToken);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  // Token reuse breach detection:
  // Because rotated tokens are retained as isRevoked: true, reusing any old token triggers full revocation
  if (session.isRevoked) {
    await revokeAllUserSessions(session.userId);
    throw new UnauthorizedError('Session revoked due to detected token reuse security violation');
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError('Refresh token has expired. Please sign in again.');
  }

  if (session.user.status !== 'ACTIVE' || session.user.isDeleted) {
    throw new ForbiddenError('User account is suspended or inactive');
  }

  try {
    jwt.verify(refreshToken, config.jwt.refreshSecret);
  } catch {
    throw new UnauthorizedError('Invalid refresh token signature');
  }

  const durationDays = session.rememberMe ? 30 : 1;
  const newExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  const refreshExpiresInStr = session.rememberMe
    ? config.jwt.refreshExpiresInRemember || '30d'
    : config.jwt.refreshExpiresInDefault || '1d';

  const newSessionId = crypto.randomUUID();
  const jti = crypto.randomUUID();

  const newAccessToken = signJwt(
    {
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: newSessionId,
      jti,
    },
    config.jwt.accessSecret,
    config.jwt.accessExpiresIn || '15m',
  );

  const newRefreshToken = signJwt(
    {
      sub: session.user.id,
      sessionId: newSessionId,
      jti: crypto.randomUUID(),
    },
    config.jwt.refreshSecret,
    refreshExpiresInStr,
  );

  const newTokenHash = hashSha256(newRefreshToken);

  // Atomic rotation: atomically claim and revoke previous session and persist rotated session row
  await prisma.$transaction(async (tx) => {
    const revoked = await tx.session.updateMany({
      where: { id: session.id, isRevoked: false },
      data: { isRevoked: true },
    });

    if (revoked.count === 0) {
      // Another concurrent request already rotated this token — revoke all user sessions
      await tx.session.updateMany({
        where: { userId: session.userId },
        data: { isRevoked: true },
      });
      throw new UnauthorizedError('Session revoked due to concurrent token reuse');
    }

    await tx.session.create({
      data: {
        id: newSessionId,
        userId: session.userId,
        tokenHash: newTokenHash,
        rememberMe: session.rememberMe,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        expiresAt: newExpiresAt,
        isRevoked: false,
      },
    });
  });

  return {
    rememberMe: session.rememberMe,
    tokens: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    },
  };
}

/**
 * Revokes every login session of a user and force-disconnects their sockets.
 * Use on password change, admin suspension / ban, or detected token theft.
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  });

  // Make already-issued access tokens fail on the very next REST request.
  // Best-effort: the DB revocation above already blocks refresh, so a Redis hiccup
  // must not make an admin ban / password change fail half-way — but log it loudly.
  try {
    await revokeUserAccessTokens(userId);
  } catch (err) {
    console.error(`[AUTH] Failed to write revoked:user marker for ${userId}:`, err);
  }

  disconnectUserSockets(userId);
}

export async function logoutUser(options: {
  sessionId?: string;
  jti?: string;
  exp?: number;
  refreshToken?: string;
}): Promise<{ message: string }> {
  // 1. Revoke session in Postgres
  let revokedSessionId = options.sessionId;
  if (options.sessionId) {
    await prisma.session.updateMany({
      where: { id: options.sessionId },
      data: { isRevoked: true },
    });
  } else if (options.refreshToken) {
    const tokenHash = hashSha256(options.refreshToken);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      select: { id: true },
    });
    revokedSessionId = session?.id;
    await prisma.session.updateMany({
      where: { tokenHash },
      data: { isRevoked: true },
    });
  }

  // 2. Invalidate this session's access tokens immediately and close its live sockets
  if (revokedSessionId) {
    try {
      await revokeSessionAccessTokens(revokedSessionId);
    } catch (err) {
      console.error(`[AUTH] Failed to write revoked:session marker for ${revokedSessionId}:`, err);
    }
    disconnectSessionSockets(revokedSessionId);
  }

  // 3. Blacklist Access Token jti in Redis until its natural expiry
  if (options.jti) {
    const nowSec = Math.floor(Date.now() / 1000);
    const remainingSec = options.exp ? Math.max(1, options.exp - nowSec) : 900;
    await redis.set(`blacklist:token:${options.jti}`, 'revoked', 'EX', remainingSec);
  }

  return { message: 'Successfully logged out' };
}
