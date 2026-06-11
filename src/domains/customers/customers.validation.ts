import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Customers Domain — Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

// ── PATCH /api/v1/customers/me ────────────────────────────────────────────────
export const UpdateProfileSchema = z
  .object({
    firstName: z
      .string({ error: 'firstName must be a string' })
      .min(1, 'firstName cannot be empty')
      .max(50, 'firstName cannot exceed 50 characters')
      .optional(),
    lastName: z
      .string({ error: 'lastName must be a string' })
      .min(1, 'lastName cannot be empty')
      .max(50, 'lastName cannot exceed 50 characters')
      .optional(),
  })
  .refine((d) => d.firstName !== undefined || d.lastName !== undefined, {
    message: 'At least one field (firstName or lastName) must be provided.',
  });

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// ── POST /api/v1/customers/locations ─────────────────────────────────────────
export const SavedLocationSchema = z.object({
  name: z
    .string({ error: 'name is required' })
    .min(1, 'name cannot be empty')
    .max(80, 'name cannot exceed 80 characters'),
  address: z
    .string({ error: 'address is required' })
    .min(1, 'address cannot be empty'),
  lat: z
    .number({ error: 'lat must be a number' })
    .min(-90, 'lat must be >= -90')
    .max(90, 'lat must be <= 90'),
  lng: z
    .number({ error: 'lng must be a number' })
    .min(-180, 'lng must be >= -180')
    .max(180, 'lng must be <= 180'),
});

export type SavedLocationInput = z.infer<typeof SavedLocationSchema>;

// ── POST /api/v1/rides/:id/share (SMS) ────────────────────────────────────────
export const ShareRideViaSmsSchema = z.object({
  phoneNumber: z
    .string({ error: 'phoneNumber is required' })
    .min(7, 'phoneNumber is too short')
    .max(20, 'phoneNumber is too long')
    .regex(/^\+?[0-9\s\-()]+$/, 'phoneNumber must be a valid phone number'),
});

export type ShareRideViaSmsInput = z.infer<typeof ShareRideViaSmsSchema>;
