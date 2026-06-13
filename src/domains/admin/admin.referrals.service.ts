import prisma from '../../config/db';
import type { UpdateReferralCampaignInput } from '../customers/customers.validation';
import { NotFoundError } from '../../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// PRD 5.6 — Admin Referral Campaign Service
// ─────────────────────────────────────────────────────────────────────────────

const CAMPAIGN_ID = 'default';

/**
 * Retrieve the active ReferralCampaign config (upsert the default row if it
 * has never been seeded so the admin panel always returns something sensible).
 */
export async function getReferralConfig() {
  return prisma.referralCampaign.upsert({
    where: { id: CAMPAIGN_ID },
    create: {
      id: CAMPAIGN_ID,
      referrerBonusAmount: 10.0,
      refereeBonusAmount: 5.0,
      isActive: true,
    },
    update: {},
  });
}

/**
 * Update one or more fields on the singleton ReferralCampaign row.
 */
export async function updateReferralConfig(payload: UpdateReferralCampaignInput) {
  // Ensure the row exists (upsert) then apply the patch
  const existing = await getReferralConfig();

  if (!existing) {
    throw new NotFoundError('ReferralCampaign');
  }

  return prisma.referralCampaign.update({
    where: { id: CAMPAIGN_ID },
    data: {
      ...(payload.referrerBonusAmount !== undefined && {
        referrerBonusAmount: payload.referrerBonusAmount,
      }),
      ...(payload.refereeBonusAmount !== undefined && {
        refereeBonusAmount: payload.refereeBonusAmount,
      }),
      ...(payload.isActive !== undefined && { isActive: payload.isActive }),
    },
  });
}
