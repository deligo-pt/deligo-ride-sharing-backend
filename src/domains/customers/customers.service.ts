import prisma from '../../config/db';
import { generateReferralCode } from '../../utils/referral.utils';
import type { CreateUserInput } from './customers.validation';

// ─────────────────────────────────────────────────────────────────────────────
// PRD 3.10 — User Registration with Referral
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new User record.
 *
 * - Auto-generates a unique referralCode (retries up to 3 times on collision).
 * - Accepts an optional `referredByCode`: if the code exists, wires up the
 *   referredById FK so the reward hook can fire after the new user's first ride.
 */
export async function registerUser(dto: CreateUserInput) {
  // 1. Resolve referredByCode → referredById (optional)
  let referredById: string | undefined;

  if (dto.referredByCode) {
    const referrer = await prisma.user.findUnique({
      where: { referralCode: dto.referredByCode },
      select: { id: true },
    });
    // Silently ignore invalid codes — don't block registration
    if (referrer) {
      referredById = referrer.id;
    }
  }

  // 2. Attempt to create the user (retry up to 3 times on referralCode collision)
  for (let attempt = 0; attempt < 3; attempt++) {
    const referralCode = generateReferralCode(dto.firstName);

    try {
      const user = await prisma.user.create({
        data: {
          email: dto.email,
          phone: dto.phone,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role ?? 'CUSTOMER',
          referralCode,
          referredById,
          // Automatically create a CustomerProfile and Wallet for CUSTOMER registrations
          ...((!dto.role || dto.role === 'CUSTOMER') && {
            customerProfile: { create: {} },
            wallet: { create: {} },
          }),
        },
      });

      // Return only safe fields
      return {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        referralCode: user.referralCode,
        referredById: user.referredById,
      };
    } catch (err: unknown) {
      const isUniqueViolation =
        (err as { code?: string }).code === 'P2002';
      if (isUniqueViolation && attempt < 2) {
        // Retry with a fresh random suffix
        continue;
      }
      throw err;
    }
  }

  // Should be unreachable but satisfies TS
  throw new Error('REGISTRATION_FAILED');
}

// ─────────────────────────────────────────────────────────────────────────────
// PRD 3.10 — Customer Wallet Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the wallet transaction history and the computed balance for the
 * authenticated customer.
 *
 * Balance = SUM of all WalletTransaction.amount values.
 * Positive amounts are credits (e.g. REFERRAL_BONUS, PROMO_CREDIT).
 * Negative amounts are debits (e.g. RIDE_PAYMENT).
 */
export async function getWallet(userId: string) {
  // Ensure the user actually exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  // Fetch all transactions newest-first
  const transactions = await prisma.walletTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      amount: true,
      type: true,
      description: true,
      createdAt: true,
    },
  });

  // Compute balance in JS — avoids a raw SQL SUM that could return null
  const balance = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  return {
    balance: Math.round(balance * 100) / 100, // round to 2dp
    currency: 'USD',
    transactions,
  };
}

