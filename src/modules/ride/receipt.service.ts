import prisma from '../../config/db';
import { NotificationService } from '../notification/notification.service';
import type { ReceiptRideData } from './receipt.interface';

// ─────────────────────────────────────────────────────────────────────────────
// Receipt Service — PRD 3.12 (Email Receipt after ride completion)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a clean HTML receipt string for a completed ride.
 */
const buildReceiptHtml = (ride: ReceiptRideData): string => {
  const fare = ride.finalFare ? `$${Number(ride.finalFare).toFixed(2)}` : 'N/A';
  const distance = ride.distanceKm ? `${Number(ride.distanceKm).toFixed(2)} km` : 'N/A';
  const duration = ride.durationMinutes ? `${ride.durationMinutes} min` : 'N/A';
  const date = ride.completedAt
    ? ride.completedAt.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
    : new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Deligo Receipt</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1a1a2e;padding:28px 32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:24px;letter-spacing:1px;">🚗 Deligo</h1>
            <p style="color:#a0a0b8;margin:6px 0 0;font-size:14px;">Your Trip Receipt</p>
          </td>
        </tr>
        <!-- Greeting -->
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-size:16px;color:#333;">Hi <strong>${ride.user.firstName}</strong>,</p>
            <p style="margin:8px 0 0;color:#666;font-size:14px;">Thanks for riding with Deligo! Here is your trip summary.</p>
          </td>
        </tr>
        <!-- Trip Details -->
        <tr>
          <td style="padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:8px;">
              <tr style="background:#f9f9fb;">
                <td style="padding:12px 16px;font-size:13px;color:#888;font-weight:bold;border-bottom:1px solid #e8e8e8;">TRIP DETAILS</td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;">
                  <p style="margin:0;font-size:13px;color:#888;">📍 Pickup</p>
                  <p style="margin:4px 0 0;font-size:14px;color:#222;">${ride.pickupAddress}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;">
                  <p style="margin:0;font-size:13px;color:#888;">🏁 Dropoff</p>
                  <p style="margin:4px 0 0;font-size:14px;color:#222;">${ride.dropoffAddress}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#555;">🚘 Vehicle</td>
                      <td align="right" style="font-size:13px;color:#222;font-weight:600;">${ride.vehicleType}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#555;">📏 Distance</td>
                      <td align="right" style="font-size:13px;color:#222;">${distance}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#555;">⏱ Duration</td>
                      <td align="right" style="font-size:13px;color:#222;">${duration}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#555;">📅 Date</td>
                      <td align="right" style="font-size:13px;color:#222;">${date}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <!-- Total Fare -->
              <tr style="background:#f0f9ff;">
                <td style="padding:16px 16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:16px;font-weight:bold;color:#1a1a2e;">💳 Total Charged</td>
                      <td align="right" style="font-size:22px;font-weight:bold;color:#2563eb;">${fare}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:0 32px 28px;text-align:center;">
            <p style="font-size:13px;color:#aaa;margin:0;">Ride ID: <code style="color:#888;">${ride.id}</code></p>
            <p style="font-size:12px;color:#bbb;margin:8px 0 0;">© 2026 Deligo. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Fetch a COMPLETED ride and dispatch a formatted HTML receipt via Email.
 * Also sends an SMS summary via Twilio.
 *
 * Designed to be called fire-and-forget (no await) from ride.service.ts
 * so it never blocks the completion API response.
 */
const generateAndSendReceipt = async (rideId: string): Promise<void> => {
  try {
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        customerProfile: {
          include: {
            user: {
              select: { id: true, firstName: true, email: true, phone: true },
            },
          },
        },
      },
    });

    if (!ride || ride.status !== 'COMPLETED') {
      console.warn(`[RECEIPT] Ride ${rideId} is not COMPLETED or not found — skipping.`);
      return;
    }

    const user = ride.customerProfile.user;
    const fare = ride.finalFare ? `$${Number(ride.finalFare).toFixed(2)}` : 'N/A';

    // 1. Send rich HTML email receipt
    const html = buildReceiptHtml({
      ...ride,
      user,
    });

    await NotificationService.dispatch(
      {
        userId: user.id,
        title: '🧾 Your Deligo Trip Receipt',
        message: `Your trip is complete! Total charged: ${fare}. Check your email for the full receipt.`,
        type: 'RIDE_COMPLETED',
        emailHtml: html,
      },
      ['EMAIL', 'SMS'],
    );

    console.info(`[RECEIPT] ✅ Receipt dispatched | rideId=${rideId} userId=${user.id}`);
  } catch (err) {
    // Receipt failure must never crash the ride completion flow
    console.error('[RECEIPT] ❌ Failed to generate/send receipt:', err);
  }
};

export const ReceiptService = {
  generateAndSendReceipt,
};
