import { z } from 'zod';

const saveFcmTokenBodySchema = z.object({
  fcmToken: z.string({ error: 'fcmToken is required' }).min(1, 'fcmToken cannot be empty'),
});

export type SaveFcmTokenDto = z.infer<typeof saveFcmTokenBodySchema>;

const ListUsersQuerySchema = z.object({
  role: z.enum(['CUSTOMER', 'DRIVER']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'DEACTIVATED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

const UserIdParamSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
});

const UpdateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED'], {
    error: 'status must be ACTIVE, SUSPENDED, or DEACTIVATED',
  }),
  reason: z.string().max(500).optional(),
});

export type UpdateUserStatusInput = z.infer<typeof UpdateUserStatusSchema>;

export const UserValidation = {
  listUsers: { query: ListUsersQuerySchema },
  updateUserStatus: { params: UserIdParamSchema, body: UpdateUserStatusSchema },
  saveFcmToken: { body: saveFcmTokenBodySchema },
};
