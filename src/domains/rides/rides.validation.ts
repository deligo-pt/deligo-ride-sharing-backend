import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Rides Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/rides/location
 *
 * Validates that a driver provides valid geographic coordinates.
 * Note: Zod v4 uses `error` (not required_error / invalid_type_error).
 */
export const UpdateLocationSchema = z.object({
  lat: z
    .number({ error: 'lat must be a number' })
    .min(-90, 'lat must be >= -90')
    .max(90, 'lat must be <= 90'),
  lng: z
    .number({ error: 'lng must be a number' })
    .min(-180, 'lng must be >= -180')
    .max(180, 'lng must be <= 180'),
});

export type UpdateLocationDto = z.infer<typeof UpdateLocationSchema>;

/**
 * POST /api/v1/rides/search
 *
 * Validates that a customer provides valid pickup coordinates.
 */
export const SearchRideSchema = z.object({
  pickupLat: z
    .number({ error: 'pickupLat must be a number' })
    .min(-90, 'pickupLat must be >= -90')
    .max(90, 'pickupLat must be <= 90'),
  pickupLng: z
    .number({ error: 'pickupLng must be a number' })
    .min(-180, 'pickupLng must be >= -180')
    .max(180, 'pickupLng must be <= 180'),
});

export type SearchRideDto = z.infer<typeof SearchRideSchema>;
