import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Auth Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const CreateAdminSchema = z.object({
  firstName: z.string().min(1, 'First name is required').trim(),
  lastName: z.string().min(1, 'Last name is required').trim(),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']).default('ADMIN'),
});

export type CreateAdminInput = z.infer<typeof CreateAdminSchema>;

export const SetAdminPasswordSchema = z.object({
  token: z.string().min(1, 'Invitation token is required').trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export type SetAdminPasswordInput = z.infer<typeof SetAdminPasswordSchema>;
