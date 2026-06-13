import { randomBytes } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Referral Code Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a human-friendly referral code.
 *
 * Format: "<NAME_PREFIX>-<4 random uppercase alphanumeric chars>"
 * Example: "JOHN-A3X9" or "USER-B7KZ" (when no name supplied)
 *
 * The 4-char random suffix gives 36^4 ≈ 1.68 million unique values per
 * prefix, which is sufficient for a collision-resistant code at scale.
 * The caller (registration service) should still handle the (rare) unique
 * constraint violation by retrying with a new suffix.
 *
 * @param firstName Optional first name of the new user.
 */
export function generateReferralCode(firstName?: string | null): string {
  const prefix = firstName
    ? firstName.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) || 'USER'
    : 'USER';

  // 3 random bytes → 6 hex chars; we take the first 4 and uppercase them
  const suffix = randomBytes(3).toString('hex').toUpperCase().slice(0, 4);

  return `${prefix}-${suffix}`;
}
