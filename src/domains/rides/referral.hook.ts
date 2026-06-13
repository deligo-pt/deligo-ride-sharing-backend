import { WalletTxType } from '@prisma/client';
import prisma from '../../config/db';
import { NotificationEngine, NotificationType } from '../notifications/notifications.service';

// ─────────────────────────────────────────────────────────────────────────────
// PRD 3.10 / PRD 5.6 — Referral Reward Hook
//
// Called fire-and-forget after a ride reaches COMPLETED status.
// Checks whether this is the rider's first completed ride and whether they
// were referred. If both conditions are true AND the ReferralCampaign is
// active, credits WalletTransactions for both the referrer and the referee,
// then dispatches an in-app + WebSocket notification to the referrer.
// ─────────────────────────────────────────────────────────────────────────────

const CAMPAIGN_ID = 'default';

/**
 * Process referral bonuses for a newly completed ride.
 *
 * @param rideId    The ride that just reached COMPLETED status.
 * @param rideUserId The CustomerProfile.userId (= User.id) of the rider.
 */
export async function processReferralReward(
  rideId: string,
  rideUserId: string,
): Promise<void> {
  try {
    // 1. Check if this is the rider's first ever COMPLETED ride
    const completedRideCount = await prisma.ride.count({
      where: {
        customerProfile: { userId: rideUserId },
        status: 'COMPLETED',
      },
    });

    // We are called right after the status update, so count === 1 means first
    if (completedRideCount !== 1) {
      return; // Not the first ride — nothing to do
    }

    // 2. Fetch the user's referredById
    const rider = await prisma.user.findUnique({
      where: { id: rideUserId },
      select: { id: true, referredById: true },
    });

    if (!rider?.referredById) {
      return; // Organic sign-up — no referrer
    }

    // 3. Fetch the active campaign config (upsert creates default if missing)
    const campaign = await prisma.referralCampaign.upsert({
      where: { id: CAMPAIGN_ID },
      create: {
        id: CAMPAIGN_ID,
        referrerBonusAmount: 10.0,
        refereeBonusAmount: 5.0,
        isActive: true,
      },
      update: {},
    });

    if (!campaign.isActive) {
      console.info('[REFERRAL] Campaign is inactive — skipping bonuses.');
      return;
    }

    const referrerId = rider.referredById;

    // 4. Credit the referrer (person who shared the code)
    await prisma.walletTransaction.create({
      data: {
        userId: referrerId,
        amount: campaign.referrerBonusAmount,
        type: WalletTxType.REFERRAL_BONUS,
        description: `Referral bonus — your friend completed their first ride! (rideId: ${rideId})`,
      },
    });

    // Also increment the referrer's Wallet.balance (best-effort)
    await prisma.wallet
      .updateMany({
        where: { userId: referrerId },
        data: { balance: { increment: campaign.referrerBonusAmount } },
      })
      .catch((e: unknown) =>
        console.warn('[REFERRAL] Failed to update referrer wallet balance:', e),
      );

    console.info(
      `[REFERRAL] ✅ Referrer bonus of $${campaign.referrerBonusAmount} credited to userId=${referrerId}`,
    );

    // 5. Credit the referee (new user who used the code) — optional
    if (campaign.refereeBonusAmount > 0) {
      await prisma.walletTransaction.create({
        data: {
          userId: rideUserId,
          amount: campaign.refereeBonusAmount,
          type: WalletTxType.REFERRAL_BONUS,
          description: `Welcome bonus for completing your first ride via referral! (rideId: ${rideId})`,
        },
      });

      await prisma.wallet
        .updateMany({
          where: { userId: rideUserId },
          data: { balance: { increment: campaign.refereeBonusAmount } },
        })
        .catch((e: unknown) =>
          console.warn('[REFERRAL] Failed to update referee wallet balance:', e),
        );

      console.info(
        `[REFERRAL] ✅ Referee bonus of $${campaign.refereeBonusAmount} credited to userId=${rideUserId}`,
      );
    }

    // 6. Notify the referrer via in-app + WebSocket (fire-and-forget)
    void NotificationEngine.dispatch(
      {
        userId: referrerId,
        title: '🎉 Referral Bonus Earned!',
        message: `Your friend completed their first ride! $${campaign.referrerBonusAmount.toFixed(2)} has been added to your wallet.`,
        type: NotificationType.SYSTEM,
        data: { rideId, bonusAmount: campaign.referrerBonusAmount },
      },
      ['IN_APP', 'WEBSOCKET'],
    );
  } catch (err) {
    // Never propagate — this is always called fire-and-forget
    console.error('[REFERRAL] Error processing referral reward:', err);
  }
}
