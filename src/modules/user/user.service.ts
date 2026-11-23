import prisma from '../../config/db';

// ─────────────────────────────────────────────────────────────────────────────
// User Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save (or replace) the FCM push token for a user.
 * Called by the mobile app on login or when the OS issues a new token.
 */
async function saveFcmToken(userId: string, fcmToken: string): Promise<{ message: string }> {
  await prisma.user.update({
    where: { id: userId },
    data: { fcmToken },
  });

  console.info(`[FCM] Token saved for userId=${userId}`);
  return { message: 'FCM token saved successfully.' };
}

export const UserService = {
  saveFcmToken,
};
