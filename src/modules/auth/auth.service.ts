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
  AppError,
} from '../../utils/errors';
import {
  LoginInput,
  ResendOtpInput,
  VerifyOtpInput,
  GoogleLoginInput,
  FacebookLoginInput,
  AppleLoginInput,
  CreateAdminInput,
  SetAdminPasswordInput,
} from './auth.validation';
import type {
  SignupInput,
  SignupRedisSession,
  ClientInfo,
  AuthTokens,
  SanitizedUser,
  SocialUserProfile,
  SocialAuthOptions,
  GooglePayload,
} from './auth.interface';
import {
  DEFAULT_LANGUAGE,
  DUMMY_HASH,
  EXTERNAL_API_TIMEOUT_MS,
  MAX_OTP_ATTEMPTS,
  MAX_OTP_RESENDS,
  OTP_RESEND_COOLDOWN_MS,
  INVITE_TOKEN_TTL_SECONDS,
  DEFAULT_SESSION_DAYS,
  REMEMBER_ME_SESSION_DAYS,
  ACCESS_TOKEN_TTL_SECONDS,
} from './auth.constant';

export const googleAuthClient = new OAuth2Client();
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

const hashSha256 = (value: string): string => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

const signJwt = (payload: object, secret: string, expiresIn: string | number): string => {
  const options: jwt.SignOptions = {
    expiresIn: expiresIn as unknown as jwt.SignOptions['expiresIn'],
  };
  return jwt.sign(payload, secret, options);
};

const maskTarget = (
  channel: 'EMAIL' | 'PHONE',
  email?: string | null,
  phone?: string | null,
): string => {
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
};

const sanitizeUser = (user: {
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
}): SanitizedUser => {
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
};

const generateUniqueReferralCode = async (): Promise<string> => {
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
};

const issueSessionAndTokens = async (
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
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> => {
  const durationDays = rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS;
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
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    },
  };
};

const dispatchOtp = async (
  channel: 'EMAIL' | 'PHONE',
  otp: string,
  targetEmail: string | null,
  targetPhone: string | null,
): Promise<void> => {
  const expiryMinutes = Math.max(1, Math.round(config.otp.expiresInSeconds / 60));

  if (channel === 'EMAIL' && targetEmail) {
    await sendEmail({
      to: targetEmail,
      subject: 'Deligo Verification Code',
      template: 'otp-verification',
      data: {
        otpCode: otp,
        expiryMinutes,
        preferredLanguage: DEFAULT_LANGUAGE,
      },
    });
  } else if (channel === 'PHONE' && targetPhone) {
    await sendBulkGateSms(
      targetPhone,
      `Your Deligo verification code is: ${otp}. Valid for ${expiryMinutes} minutes.`,
    );
  }
};

const sendWelcomeEmailAsync = (user: {
  email: string | null;
  firstName: string | null;
  referralCode: string;
  preferredLanguage: string | null;
}): void => {
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
};

const verifyGoogleIdToken = async (idToken: string): Promise<GooglePayload> => {
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
};

const initiateSignup = async (
  input: SignupInput,
  role: 'CUSTOMER' | 'DRIVER' | 'FLEET_MANAGER' = 'CUSTOMER',
): Promise<{
  signupSessionId: string;
  channel: 'EMAIL' | 'PHONE';
  maskedTarget: string;
  expiresIn: number;
}> => {
  const email = input.email;
  const contactNumber = input.contactNumber;
  const channel: 'EMAIL' | 'PHONE' = email ? 'EMAIL' : 'PHONE';

  if (email) {
    const existing = await prisma.user.findFirst({ where: { email, isDeleted: false } });
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }
  } else if (contactNumber) {
    const existing = await prisma.user.findFirst({
      where: { phone: contactNumber, isDeleted: false },
    });
    if (existing) {
      throw new ConflictError('A user with this phone number already exists');
    }
  }

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

  const passwordHash = await bcrypt.hash(input.password, config.bcrypt.saltRounds);
  const rawOtp = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashSha256(rawOtp);
  const signupSessionId = crypto.randomUUID();

  const now = Date.now();
  const expiresAt = now + config.otp.expiresInSeconds * 1000;

  const sessionData: SignupRedisSession = {
    payload: {
      email,
      contactNumber,
      passwordHash,
      referralCode: input.referralCode?.trim().toUpperCase() || null,
      referrerId,
      role,
    },
    otp: {
      codeHash,
      channel,
      expiresAt,
    },
    resendCount: 0,
    lastSentAt: now,
  };

  const redisKey = `signup:session:${signupSessionId}`;
  await redis.set(redisKey, JSON.stringify(sessionData), 'EX', config.otp.signupSessionTtlSeconds);

  await dispatchOtp(channel, rawOtp, email ?? null, contactNumber ?? null);

  return {
    signupSessionId,
    channel,
    maskedTarget: maskTarget(channel, email, contactNumber),
    expiresIn: config.otp.expiresInSeconds,
  };
};

/** A client-supplied email / contactNumber (optional) must belong to the signup session. */
const assertSessionContact = (
  session: SignupRedisSession,
  provided: { email?: string; contactNumber?: string },
): void => {
  if (
    (provided.email !== undefined && provided.email !== session.payload.email) ||
    (provided.contactNumber !== undefined &&
      provided.contactNumber !== session.payload.contactNumber)
  ) {
    throw new BadRequestError('The provided contact does not match this signup session');
  }
};

const resendSignupOtp = async (
  input: ResendOtpInput,
): Promise<{
  signupSessionId: string;
  channel: 'EMAIL' | 'PHONE';
  maskedTarget: string;
  expiresIn: number;
}> => {
  const redisKey = `signup:session:${input.signupSessionId}`;
  const attemptsKey = `signup:otp:attempts:${input.signupSessionId}`;
  const rawData = await redis.get(redisKey);

  if (!rawData) {
    throw new NotFoundError('Signup session expired or not found. Please restart signup.');
  }

  const session = JSON.parse(rawData) as SignupRedisSession;
  assertSessionContact(session, input);
  const targetChannel = session.otp.channel;

  const now = Date.now();
  const elapsed = now - session.lastSentAt;

  if (elapsed < OTP_RESEND_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
    throw new RateLimitError(`Please wait ${remainingSeconds} seconds before requesting a new OTP`);
  }

  if (session.resendCount >= MAX_OTP_RESENDS) {
    throw new RateLimitError(
      'Maximum OTP resend limit reached for this session. Please restart registration.',
    );
  }

  const rawOtp = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashSha256(rawOtp);

  session.otp = {
    codeHash,
    channel: targetChannel,
    expiresAt: now + config.otp.expiresInSeconds * 1000,
  };
  session.resendCount += 1;
  session.lastSentAt = now;

  const ttl = await redis.ttl(redisKey);
  await redis.set(
    redisKey,
    JSON.stringify(session),
    'EX',
    ttl > 0 ? ttl : config.otp.signupSessionTtlSeconds,
  );

  await redis.del(attemptsKey);

  await dispatchOtp(
    targetChannel,
    rawOtp,
    session.payload.email ?? null,
    session.payload.contactNumber ?? null,
  );

  return {
    signupSessionId: input.signupSessionId,
    channel: targetChannel,
    maskedTarget: maskTarget(targetChannel, session.payload.email, session.payload.contactNumber),
    expiresIn: config.otp.expiresInSeconds,
  };
};

const verifySignupOtp = async (
  input: VerifyOtpInput,
  clientInfo: ClientInfo,
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> => {
  const redisKey = `signup:session:${input.signupSessionId}`;
  const attemptsKey = `signup:otp:attempts:${input.signupSessionId}`;
  const rawData = await redis.get(redisKey);

  if (!rawData) {
    throw new NotFoundError('Signup session expired or not found. Please restart signup.');
  }

  const session = JSON.parse(rawData) as SignupRedisSession;
  assertSessionContact(session, input);

  if (Date.now() > session.otp.expiresAt) {
    throw new BadRequestError('Verification code has expired. Please request a new one.');
  }

  const inputHash = hashSha256(input.otp);
  const expectedHash = session.otp.codeHash;
  const isMatch =
    inputHash.length === expectedHash.length &&
    crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(expectedHash));

  if (!isMatch) {
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

  const ownReferralCode = await generateUniqueReferralCode();

  let createdUser;
  try {
    createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: session.payload.email ?? null,
          phone: session.payload.contactNumber ?? null,
          firstName: null,
          lastName: null,
          role: session.payload.role || 'CUSTOMER',
          status: 'ACTIVE',
          referralCode: ownReferralCode,
          referrerId: session.payload.referrerId,
          isEmailVerified: session.otp.channel === 'EMAIL',
          isPhoneVerified: session.otp.channel === 'PHONE',
        },
      });

      await tx.account.create({
        data: {
          userId: user.id,
          provider: 'CREDENTIALS',
          providerAccountId: user.id,
          email: session.payload.email ?? null,
          phone: session.payload.contactNumber ?? null,
          passwordHash: session.payload.passwordHash,
        },
      });

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

  await redis.del(redisKey, attemptsKey);
  sendWelcomeEmailAsync(createdUser);

  return issueSessionAndTokens(createdUser, false, clientInfo);
};

const login = async (
  input: LoginInput,
  clientInfo: ClientInfo,
  allowedRoles?: ('CUSTOMER' | 'DRIVER' | 'ADMIN' | 'FLEET_MANAGER')[],
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> => {
  const user = await prisma.user.findFirst({
    where: {
      ...(input.email ? { email: input.email } : { phone: input.contactNumber }),
      isDeleted: false,
    },
    include: {
      account: {
        where: { isDeleted: false },
      },
    },
  });

  if (!user) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid credentials');
  }

  const credentialsAccount = user.account.find((acc) => acc.provider === 'CREDENTIALS');

  if (!credentialsAccount || !credentialsAccount.passwordHash) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid credentials');
  }

  const passwordMatch = await bcrypt.compare(input.password, credentialsAccount.passwordHash);
  if (!passwordMatch) {
    throw new UnauthorizedError('Invalid credentials');
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
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
};

const handleSocialAuth = async (
  profile: SocialUserProfile,
  options: SocialAuthOptions,
  clientInfo: ClientInfo,
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> => {
  const rememberMe = options.rememberMe ?? true;

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
      if (
        existingUserByEmail.role !== 'CUSTOMER' ||
        existingUserByEmail.status === 'PENDING_VERIFICATION'
      ) {
        throw new ForbiddenError('Social login is not allowed for this account.');
      }

      if (existingUserByEmail.status === 'SUSPENDED') {
        throw new ForbiddenError(
          'Your account has been suspended. Please contact customer support.',
        );
      }
      if (existingUserByEmail.status === 'DEACTIVATED') {
        throw new ForbiddenError('Your account has been deactivated.');
      }

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
};

const googleLogin = async (
  input: GoogleLoginInput,
  clientInfo: ClientInfo,
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> => {
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
};

const facebookLogin = async (
  input: FacebookLoginInput,
  clientInfo: ClientInfo,
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> => {
  const appId = config.facebook.appId;
  const appSecret = config.facebook.appSecret;

  if (!appId || !appSecret) {
    throw new BadRequestError('Facebook authentication is not configured on the server');
  }

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
  const isEmailVerified = false;

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
};

const appleLogin = async (
  input: AppleLoginInput,
  clientInfo: ClientInfo,
): Promise<{ user: SanitizedUser; tokens: AuthTokens }> => {
  let sub: string;
  let email: string | null = null;
  let isEmailVerified = false;
  let firstName = input.user?.firstName || null;
  let lastName = input.user?.lastName || null;

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
};

const refreshAccessToken = async (
  refreshToken: string,
): Promise<{ tokens: AuthTokens; rememberMe: boolean }> => {
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

  const durationDays = session.rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS;
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

  await prisma.$transaction(async (tx) => {
    const revoked = await tx.session.updateMany({
      where: { id: session.id, isRevoked: false },
      data: { isRevoked: true },
    });

    if (revoked.count === 0) {
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
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    },
  };
};

const revokeAllUserSessions = async (userId: string): Promise<void> => {
  await prisma.session.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  });

  try {
    await revokeUserAccessTokens(userId);
  } catch (err) {
    console.error(`[AUTH] Failed to write revoked:user marker for ${userId}:`, err);
  }

  disconnectUserSockets(userId);
};

const logoutUser = async (options: {
  sessionId?: string;
  jti?: string;
  exp?: number;
  userId?: string;
  refreshToken?: string;
  /** This device's FCM token: clears only that token. */
  fcmToken?: string;
  /** Default true. false keeps the user's push token (e.g. "sign out of this browser only"). */
  clearFcmToken?: boolean;
}): Promise<{ message: string }> => {
  let revokedSessionId = options.sessionId;
  let ownerId = options.userId;

  if (options.sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: options.sessionId },
      select: { userId: true },
    });
    ownerId = ownerId ?? session?.userId;
    await prisma.session.updateMany({
      where: { id: options.sessionId },
      data: { isRevoked: true },
    });
  } else if (options.refreshToken) {
    const tokenHash = hashSha256(options.refreshToken);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true },
    });
    revokedSessionId = session?.id;
    ownerId = ownerId ?? session?.userId;
    await prisma.session.updateMany({
      where: { tokenHash },
      data: { isRevoked: true },
    });
  }

  if (ownerId && options.clearFcmToken !== false) {
    try {
      await prisma.user.updateMany({
        where: { id: ownerId, ...(options.fcmToken && { fcmToken: options.fcmToken }) },
        data: { fcmToken: null },
      });
    } catch (err) {
      console.error(`[AUTH] Failed to clear fcmToken on logout for ${ownerId}:`, err);
    }
  }

  if (revokedSessionId) {
    try {
      await revokeSessionAccessTokens(revokedSessionId);
    } catch (err) {
      console.error(`[AUTH] Failed to write revoked:session marker for ${revokedSessionId}:`, err);
    }
    disconnectSessionSockets(revokedSessionId);
  }

  if (options.jti) {
    const nowSec = Math.floor(Date.now() / 1000);
    const remainingSec = options.exp ? Math.max(1, options.exp - nowSec) : ACCESS_TOKEN_TTL_SECONDS;
    await redis.set(`blacklist:token:${options.jti}`, 'revoked', 'EX', remainingSec);
  }

  return { message: 'Successfully logged out' };
};

const createAdmin = async (
  input: CreateAdminInput,
  creator: { id: string; role: string },
): Promise<{ user: SanitizedUser; message: string }> => {
  if (input.role === 'SUPER_ADMIN') {
    const creatorUser = await prisma.user.findUnique({
      where: { id: creator.id },
      include: { adminProfile: true },
    });

    const isSuperAdmin =
      creator.role === 'SUPER_ADMIN' || creatorUser?.adminProfile?.accessLabel === 'SUPER_ADMIN';

    if (!isSuperAdmin) {
      throw new ForbiddenError('Only a SUPER_ADMIN can create another SUPER_ADMIN');
    }
  }

  const existingUser = await prisma.user.findFirst({
    where: { email: input.email, isDeleted: false },
  });
  if (existingUser) {
    throw new ConflictError('A user with this email address already exists');
  }

  const referralCode = await generateUniqueReferralCode();

  const createdAdmin = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        role: 'ADMIN',
        status: 'PENDING_VERIFICATION',
        isEmailVerified: false,
        referralCode,
        referrerId: creator.id,
      },
    });

    await tx.adminProfile.create({
      data: {
        userId: user.id,
        accessLabel: input.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'SUPPORT',
      },
    });

    return user;
  });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSha256(rawToken);
  const redisKey = `admin:invite:${tokenHash}`;

  const payload = JSON.stringify({
    userId: createdAdmin.id,
    email: createdAdmin.email,
    role: input.role,
  });

  await redis.set(redisKey, payload, 'EX', INVITE_TOKEN_TTL_SECONDS);

  const adminUrl = config.frontend.adminUrl;
  const inviteUrl = `${adminUrl.replace(/\/+$/, '')}/set-password?token=${rawToken}`;

  try {
    const emailResult = await sendEmail({
      to: createdAdmin.email!,
      subject: 'You have been invited as an Administrator on Deligo',
      template: 'admin-invite',
      data: {
        name: createdAdmin.firstName,
        inviteUrl,
        role: input.role,
        expiresInHours: 24,
      },
    });

    if (!emailResult.success) {
      console.error(
        `[adminAuth] Failed to dispatch invitation email to ${createdAdmin.email}: ${emailResult.error}`,
      );
      if (config.isProduction) {
        await redis.del(redisKey);
        throw new AppError(
          `Failed to deliver invitation email: ${emailResult.error || 'Unknown email service error'}`,
          500,
          'EMAIL_DELIVERY_FAILED',
        );
      }
    }
  } catch (err: unknown) {
    if (err instanceof AppError) {
      throw err;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[adminAuth] Exception during admin invitation email dispatch: ${errMsg}`);
    await redis.del(redisKey);
    throw new AppError(
      `Failed to deliver invitation email: ${errMsg}`,
      500,
      'EMAIL_DELIVERY_FAILED',
    );
  }

  return {
    user: sanitizeUser(createdAdmin),
    message: 'Admin created. Invitation link sent to email.',
  };
};

const setAdminPassword = async (input: SetAdminPasswordInput): Promise<{ message: string }> => {
  const tokenHash = hashSha256(input.token.trim());
  const redisKey = `admin:invite:${tokenHash}`;
  const rawData = await redis.get(redisKey);

  if (!rawData) {
    throw new BadRequestError('Invalid or expired invitation link');
  }

  const inviteData = JSON.parse(rawData) as { userId: string; email: string };

  const user = await prisma.user.findUnique({
    where: { id: inviteData.userId },
  });

  if (!user || user.isDeleted) {
    throw new BadRequestError('Admin user account not found or has been deleted');
  }

  const passwordHash = await bcrypt.hash(input.password, config.bcrypt.saltRounds);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        status: 'ACTIVE',
        isEmailVerified: true,
      },
    });

    await tx.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'CREDENTIALS',
          providerAccountId: user.id,
        },
      },
      create: {
        userId: user.id,
        provider: 'CREDENTIALS',
        providerAccountId: user.id,
        email: user.email,
        passwordHash,
      },
      update: {
        passwordHash,
        isDeleted: false,
        deletedAt: null,
      },
    });
  });

  await redis.del(redisKey);
  await revokeAllUserSessions(user.id);

  return { message: 'Password set successfully. You can now log in.' };
};

export const AuthService = {
  hashSha256,
  sanitizeUser,
  generateUniqueReferralCode,
  verifyGoogleIdToken,
  initiateSignup,
  resendSignupOtp,
  verifySignupOtp,
  login,
  handleSocialAuth,
  googleLogin,
  facebookLogin,
  appleLogin,
  refreshAccessToken,
  revokeAllUserSessions,
  logoutUser,
  createAdmin,
  setAdminPassword,
};
