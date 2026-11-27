import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import type { AppConfig } from '../../config';
import type { ExtendedPrismaClient } from '../../config/db';

const REFERRAL_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const cleanString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const createReferralCode = async (
  tx: Parameters<Parameters<ExtendedPrismaClient['$transaction']>[0]>[0],
): Promise<string> => {
  for (let i = 0; i < 10; i++) {
    let code = 'DL';

    for (let j = 0; j < 6; j++) {
      code += REFERRAL_CHARS[crypto.randomInt(0, REFERRAL_CHARS.length)];
    }

    const exists = await tx.user.findFirst({
      where: { referralCode: code },
      select: { id: true },
    });

    if (!exists) return code;
  }

  throw new Error('Could not generate a unique referral code.');
};

export const seedSuperAdmin = async (
  prisma: ExtendedPrismaClient,
  appConfig: AppConfig,
): Promise<void> => {
  const email = cleanString(appConfig.superAdmin.email)?.toLowerCase();
  const password = appConfig.superAdmin.password;

  if (!email || typeof password !== 'string' || !password.trim()) {
    console.warn('[SuperAdminSeeder] Missing email or password. Skipping.');
    return;
  }

  const phone = cleanString(appConfig.superAdmin.phone);
  const firstName = cleanString(appConfig.superAdmin.firstName);
  const lastName = cleanString(appConfig.superAdmin.lastName);

  try {
    const status = await prisma.$transaction(async (tx) => {
      const existingSuperAdmin = await tx.user.findFirst({
        where: {
          role: 'ADMIN',
          isDeleted: false,
          adminProfile: {
            is: { accessLabel: 'SUPER_ADMIN' },
          },
        },
        select: { id: true },
      });

      if (existingSuperAdmin) return 'exists' as const;

      const emailTaken = await tx.user.findFirst({
        where: { email },
        select: { id: true },
      });

      if (emailTaken) return 'email-conflict' as const;

      if (phone) {
        const phoneTaken = await tx.user.findFirst({
          where: { phone },
          select: { id: true },
        });

        if (phoneTaken) return 'phone-conflict' as const;
      }

      const passwordHash = await bcrypt.hash(password, appConfig.bcrypt.saltRounds);

      const referralCode = await createReferralCode(tx);

      const user = await tx.user.create({
        data: {
          email,
          phone,
          firstName,
          lastName,
          role: 'ADMIN',
          status: 'ACTIVE',
          isEmailVerified: true,
          isDeleted: false,
          deletedAt: null,
          referralCode,
        },
      });

      await tx.adminProfile.create({
        data: {
          userId: user.id,
          accessLabel: 'SUPER_ADMIN',
        },
      });

      await tx.account.create({
        data: {
          userId: user.id,
          provider: 'CREDENTIALS',
          providerAccountId: user.id,
          email,
          passwordHash,
          isDeleted: false,
          deletedAt: null,
        },
      });

      return 'created' as const;
    });

    const messages = {
      exists: '[SuperAdminSeeder] Super Admin already exists.',
      'email-conflict': '[SuperAdminSeeder] Email already in use.',
      'phone-conflict': '[SuperAdminSeeder] Phone already in use.',
      created: '[SuperAdminSeeder] Super Admin created successfully.',
    } as const;

    console.info(messages[status]);
  } catch (error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';

    if (code === 'P2002') {
      console.error('[SuperAdminSeeder] Unique constraint conflict.');
      return;
    }

    const message = error instanceof Error ? error.message : String(error);

    console.error('[SuperAdminSeeder] Failed:', message.split(password).join('[REDACTED]'));
  }
};
