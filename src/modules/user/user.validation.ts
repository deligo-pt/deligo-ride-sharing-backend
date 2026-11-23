import { z } from 'zod';

// ── PATCH /api/v1/users/fcm-token ────────────────────────────────────────────
const saveFcmTokenBodySchema = z.object({
  fcmToken: z.string({ error: 'fcmToken is required' }).min(1, 'fcmToken cannot be empty'),
});

export type SaveFcmTokenDto = z.infer<typeof saveFcmTokenBodySchema>;

export const UserValidation = {
  saveFcmToken: { body: saveFcmTokenBodySchema },
};
