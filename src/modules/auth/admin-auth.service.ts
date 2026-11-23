import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '../../config/db';
import { config } from '../../config';
import { redis } from '../../utils/redis';
import { sendEmail } from '../../utils/email.service';
import { AppError, BadRequestError, ConflictError, ForbiddenError } from '../../utils/errors';
import {
  hashSha256,
  sanitizeUser,
  generateUniqueReferralCode,
  revokeAllUserSessions,
  SanitizedUser,
} from './auth.service';
import { CreateAdminInput, SetAdminPasswordInput } from './admin-auth.validation';

const INVITE_TOKEN_TTL_SECONDS = 86400; // 24 hours

// ─────────────────────────────────────────────────────────────────────────────
// Admin Auth Service
//
// Manages Admin creation with privilege escalation protection, Redis-based
// one-time invitation links, and secure password setup.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new Administrator with PENDING_VERIFICATION status and emails
 * a one-time setup link containing a cryptographically secure token.
 */
export async function createAdmin(
  input: CreateAdminInput,
  creator: { id: string; role: string },
): Promise<{ user: SanitizedUser; message: string }> {
  // 1. Strict Privilege Escalation Check:
  // Only a SUPER_ADMIN can create another SUPER_ADMIN.
  if (input.role === 'SUPER_ADMIN') {
    const creatorUser = await prisma.user.findUnique({
      where: { id: creator.id },
      include: { adminProfile: true },
    });

    const isSuperAdmin =
      creator.role === 'SUPER_ADMIN' ||
      creatorUser?.adminProfile?.accessLabel === 'SUPER_ADMIN';

    if (!isSuperAdmin) {
      throw new ForbiddenError('Only a SUPER_ADMIN can create another SUPER_ADMIN');
    }
  }

  // 2. Check if email already exists
  const existingUser = await prisma.user.findFirst({
    where: { email: input.email, isDeleted: false },
  });
  if (existingUser) {
    throw new ConflictError('A user with this email address already exists');
  }

  // 3. Generate unique referral code
  const referralCode = await generateUniqueReferralCode();

  // 4. Create User and AdminProfile in PostgreSQL
  // Status is PENDING_VERIFICATION to block login until password is set
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

  // 5. Generate secure 32-byte token and store SHA-256 hash in Redis
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSha256(rawToken);
  const redisKey = `admin:invite:${tokenHash}`;

  const payload = JSON.stringify({
    userId: createdAdmin.id,
    email: createdAdmin.email,
    role: input.role,
  });

  await redis.set(redisKey, payload, 'EX', INVITE_TOKEN_TTL_SECONDS);

  // 6. Build one-time invite URL and send email
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
        `[adminAuth] ❌ Failed to dispatch invitation email to ${createdAdmin.email}: ${emailResult.error}`,
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
    console.error(`[adminAuth] ❌ Exception during admin invitation email dispatch: ${errMsg}`);
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
}

/**
 * Validates the one-time invitation token from Redis, sets the admin's password,
 * activates the account, and immediately invalidates the token.
 */
export async function setAdminPassword(
  input: SetAdminPasswordInput,
): Promise<{ message: string }> {
  // 1. Hash incoming token and check Redis
  const tokenHash = hashSha256(input.token.trim());
  const redisKey = `admin:invite:${tokenHash}`;
  const rawData = await redis.get(redisKey);

  if (!rawData) {
    throw new BadRequestError('Invalid or expired invitation link');
  }

  const inviteData = JSON.parse(rawData) as { userId: string; email: string };

  // 2. Verify admin user exists and is not deleted
  const user = await prisma.user.findUnique({
    where: { id: inviteData.userId },
  });

  if (!user || user.isDeleted) {
    throw new BadRequestError('Admin user account not found or has been deleted');
  }

  // 3. Hash the new password
  const passwordHash = await bcrypt.hash(input.password, config.bcrypt.saltRounds);

  // 4. Atomically activate user and upsert CREDENTIALS account
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

  // 5. Immediately delete Redis key to prevent token reuse
  await redis.del(redisKey);

  // 6. Password changed → invalidate every existing session and live socket
  await revokeAllUserSessions(user.id);

  return { message: 'Password set successfully. You can now log in.' };
}
