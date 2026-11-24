import { z } from 'zod';

const TriggerSosSchema = z.object({
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

const ResolveAlertSchema = z.object({
  status: z.enum(['RESOLVED', 'FALSE_ALARM'], {
    error: 'status must be one of: RESOLVED, FALSE_ALARM',
  }),

  notes: z
    .string({ error: 'notes must be a string' })
    .min(3, 'notes must be at least 3 characters')
    .max(500, 'notes cannot exceed 500 characters'),
});

export type ResolveAlertDto = z.infer<typeof ResolveAlertSchema>;

const AlertParamsSchema = z.object({
  id: z.string().min(1, 'Alert ID is required'),
});

export const SafetyValidation = {
  triggerSos: { body: TriggerSosSchema },
  resolveAlert: { params: AlertParamsSchema, body: ResolveAlertSchema },
};
