import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { config } from '../../config';
import { redis } from '../../utils/redis';
import { sendEmail } from '../../utils/email.service';
import { sendBulkGateSms } from '../../utils/bulkgate';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
} from '../../utils/errors';
import { InitiateSignupInput, LoginInput, ResendOtpInput, VerifyOtpInput } from './auth.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Service
//
// Handles Signup (Redis session + OTP -> Atomic Postgres write),
// Login (Credentials, timing attack prevention, multi-device sessions),
// Token Refresh (Rotation, breach detection), and Logout (Blacklist + Revocation).
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
  };
  otp: {
    codeHash: string;
    channel: 'EMAIL' | 'PHONE';
    expiresAt: number;
    attempts: number;
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

// Dummy hash for constant-time comparison against timing-based user enumeration
const DUMMY_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK8.';

function hashSha256(value: string): string {
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

function sanitizeUser(user: {
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

async function generateUniqueReferralCode(): Promise<string> {
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

async function dispatchOtp(
  channel: 'EMAIL' | 'PHONE',
  otp: string,
  targetEmail: string | null,
  targetPhone: string | null,
  firstName: string,
  language: 'EN' | 'PT',
): Promise<void> {
  if (channel === 'EMAIL' && targetEmail) {
    await sendEmail({
      to: targetEmail,
      subject: language === 'PT' ? 'Código de Verificação Deligo' : 'Deligo Verification Code',
      template: 'otp-verification',
      data: {
        name: firstName,
        otpCode: otp,
        expiryMinutes: Math.round(config.otp.expiresInSeconds / 60),
        preferredLanguage: language,
      },
    });
  } else if (channel === 'PHONE' && targetPhone) {
    const text =
      language === 'PT'
        ? `Seu codigo de verificacao Deligo e: ${otp}. Valido por 5 minutos.`
        : `Your Deligo verification code is: ${otp}. Valid for 5 minutes.`;
    await sendBulkGateSms(targetPhone, text);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Signup Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function initiateSignup(input: InitiateSignupInput): Promise<{
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

  // Validate referralCode if provided
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

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, config.bcrypt.saltRounds);

  // Generate 6-digit OTP & Hash
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
    },
    otp: {
      codeHash,
      channel: input.otpChannel,
      expiresAt,
      attempts: 0,
    },
    resendCount: 0,
    lastSentAt: now,
  };

  // Store in Redis with TTL
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
  const rawData = await redis.get(redisKey);

  if (!rawData) {
    throw new NotFoundError('Signup session expired or not found. Please restart signup.');
  }

  const session: SignupRedisSession = JSON.parse(rawData);
  const targetChannel = input.channel || session.otp.channel;

  // Channel validation against payload
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

  // Enforce cooldown (60 seconds)
  if (elapsed < 60_000) {
    const remainingSeconds = Math.ceil((60_000 - elapsed) / 1000);
    throw new RateLimitError(`Please wait ${remainingSeconds} seconds before requesting a new OTP`);
  }

  // Enforce max resend count (3)
  if (session.resendCount >= 3) {
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
    attempts: 0,
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

  // Dispatch OTP
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
  const rawData = await redis.get(redisKey);

  if (!rawData) {
    throw new NotFoundError('Signup session expired or not found. Please restart signup.');
  }

  const session: SignupRedisSession = JSON.parse(rawData);

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
    session.otp.attempts += 1;
    if (session.otp.attempts >= 5) {
      await redis.del(redisKey);
      throw new RateLimitError(
        'Too many invalid attempts. Signup session terminated for security.',
      );
    }

    // Persist incremented attempts preserving TTL
    await redis.set(redisKey, JSON.stringify(session), 'KEEPTTL');
    throw new BadRequestError('Invalid verification code', {
      remainingAttempts: 5 - session.otp.attempts,
    });
  }

  // Atomic database transaction
  const referralCode = await generateUniqueReferralCode();

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
          role: 'CUSTOMER',
          status: 'ACTIVE',
          preferredLanguage: session.payload.preferredLanguage,
          referralCode,
          referrerId: session.payload.referrerId,
          isEmailVerified: session.otp.channel === 'EMAIL',
          isPhoneVerified: session.otp.channel === 'PHONE',
        },
      });

      // 2. Create Account
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

      // 3. Create CustomerProfile
      await tx.customerProfile.create({
        data: {
          userId: user.id,
        },
      });

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

  // Clean up Redis session
  await redis.del(redisKey);

  // Issue tokens & create session record
  const sessionId = crypto.randomUUID();
  const jti = crypto.randomUUID();

  const accessToken = signJwt(
    {
      sub: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
      sessionId,
      jti,
    },
    config.jwt.accessSecret,
    config.jwt.accessExpiresIn || '15m',
  );

  const refreshToken = signJwt(
    {
      sub: createdUser.id,
      sessionId,
      jti: crypto.randomUUID(),
    },
    config.jwt.refreshSecret,
    config.jwt.refreshExpiresInDefault || '1d',
  );

  const tokenHash = hashSha256(refreshToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: createdUser.id,
      tokenHash,
      rememberMe: false,
      userAgent: clientInfo.userAgent || null,
      ipAddress: clientInfo.ipAddress || null,
      expiresAt,
      isRevoked: false,
    },
  });

  // Non-blocking welcome email
  if (createdUser.email) {
    void sendEmail({
      to: createdUser.email,
      subject:
        createdUser.preferredLanguage === 'PT' ? 'Bem-vindo ao Deligo!' : 'Welcome to Deligo!',
      template: 'welcome',
      data: {
        name: createdUser.firstName,
        referralCode: createdUser.referralCode,
        preferredLanguage: createdUser.preferredLanguage,
      },
    });
  }

  return {
    user: sanitizeUser(createdUser),
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: 900,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Login & Session Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function login(
  input: LoginInput,
  clientInfo: ClientInfo,
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

  // Check credentials account
  const credentialsAccount = user.account.find((acc) => acc.provider === 'CREDENTIALS');

  if (!credentialsAccount || !credentialsAccount.passwordHash) {
    const socialProviders = user.account
      .map((acc) => acc.provider)
      .filter((p) => p !== 'CREDENTIALS');
    if (socialProviders.length > 0) {
      throw new BadRequestError(
        `This account was created using ${socialProviders.join(', ')}. Please use social login or reset password to set up credentials.`,
      );
    }
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid credentials');
  }

  // Compare password
  const passwordMatch = await bcrypt.compare(input.password, credentialsAccount.passwordHash);
  if (!passwordMatch) {
    throw new UnauthorizedError('Invalid credentials');
  }

  // Check user status
  if (user.status === 'SUSPENDED') {
    throw new ForbiddenError('Your account has been suspended. Please contact customer support.');
  }
  if (user.status === 'DEACTIVATED') {
    throw new ForbiddenError('Your account has been deactivated.');
  }
  if (user.status === 'PENDING_VERIFICATION') {
    throw new ForbiddenError('Account verification is pending.');
  }

  // Session duration
  const durationDays = input.rememberMe ? 30 : 1;
  const refreshExpiresInStr = input.rememberMe
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
      rememberMe: Boolean(input.rememberMe),
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

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
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

  // Detect token reuse breach
  if (session.isRevoked) {
    // Revoke all sessions for this user as a security measure
    await prisma.session.updateMany({
      where: { userId: session.userId },
      data: { isRevoked: true },
    });
    throw new UnauthorizedError('Session revoked due to detected token reuse security violation');
  }

  // Check expiration
  if (session.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError('Refresh token has expired. Please sign in again.');
  }

  // Check user status
  if (session.user.status !== 'ACTIVE' || session.user.isDeleted) {
    throw new ForbiddenError('User account is suspended or inactive');
  }

  // Verify JWT signature
  try {
    jwt.verify(refreshToken, config.jwt.refreshSecret);
  } catch {
    throw new UnauthorizedError('Invalid refresh token signature');
  }

  // Rotate tokens
  const durationDays = session.rememberMe ? 30 : 1;
  const newExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  const refreshExpiresInStr = session.rememberMe
    ? config.jwt.refreshExpiresInRemember || '30d'
    : config.jwt.refreshExpiresInDefault || '1d';

  const jti = crypto.randomUUID();
  const newAccessToken = signJwt(
    {
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
      jti,
    },
    config.jwt.accessSecret,
    config.jwt.accessExpiresIn || '15m',
  );

  const newRefreshToken = signJwt(
    {
      sub: session.user.id,
      sessionId: session.id,
      jti: crypto.randomUUID(),
    },
    config.jwt.refreshSecret,
    refreshExpiresInStr,
  );

  const newTokenHash = hashSha256(newRefreshToken);

  await prisma.session.update({
    where: { id: session.id },
    data: {
      tokenHash: newTokenHash,
      expiresAt: newExpiresAt,
    },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: 900,
  };
}

export async function logoutUser(options: {
  sessionId?: string;
  jti?: string;
  exp?: number;
  refreshToken?: string;
}): Promise<{ message: string }> {
  // 1. Revoke session in Postgres
  if (options.sessionId) {
    await prisma.session.updateMany({
      where: { id: options.sessionId },
      data: { isRevoked: true },
    });
  } else if (options.refreshToken) {
    const tokenHash = hashSha256(options.refreshToken);
    await prisma.session.updateMany({
      where: { tokenHash },
      data: { isRevoked: true },
    });
  }

  // 2. Blacklist Access Token jti in Redis
  if (options.jti) {
    const nowSec = Math.floor(Date.now() / 1000);
    const remainingSec = options.exp ? Math.max(1, options.exp - nowSec) : 900;
    await redis.set(`blacklist:token:${options.jti}`, 'revoked', 'EX', remainingSec);
  }

  return { message: 'Successfully logged out' };
}
