import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Safety Domain — Validation Schemas  (PRD 3.13 / 4.13)
// ─────────────────────────────────────────────────────────────────────────────

// ── POST /safety/sos ──────────────────────────────────────────────────────────

export const TriggerSosSchema = z.object({
  rideId: z.string().uuid('rideId must be a valid UUID').optional(),

  lat: z
    .number({ error: 'lat must be a number' })
    .min(-90, 'lat must be >= -90')
    .max(90, 'lat must be <= 90'),

  lng: z
    .number({ error: 'lng must be a number' })
    .min(-180, 'lng must be >= -180')
    .max(180, 'lng must be <= 180'),
});

export type TriggerSosDto = z.infer<typeof TriggerSosSchema>;

// ── PATCH /safety/sos/:id/resolve ────────────────────────────────────────────

export const ResolveAlertSchema = z.object({
  status: z.enum(['RESOLVED', 'FALSE_ALARM'], {
    error: 'status must be one of: RESOLVED, FALSE_ALARM',
  }),

  notes: z
    .string({ error: 'notes must be a string' })
    .min(3, 'notes must be at least 3 characters')
    .max(500, 'notes cannot exceed 500 characters'),
});

export type ResolveAlertDto = z.infer<typeof ResolveAlertSchema>;
