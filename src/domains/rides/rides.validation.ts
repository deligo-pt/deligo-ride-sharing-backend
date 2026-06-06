import { z } from 'zod';
import { VehicleType } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Rides Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

// ── Reusable coordinate fields ────────────────────────────────────────────────
const latField = (name: string) =>
  z
    .number({ error: `${name} must be a number` })
    .min(-90, `${name} must be >= -90`)
    .max(90, `${name} must be <= 90`);

const lngField = (name: string) =>
  z
    .number({ error: `${name} must be a number` })
    .min(-180, `${name} must be >= -180`)
    .max(180, `${name} must be <= 180`);

// ── PATCH /api/v1/rides/location ──────────────────────────────────────────────
export const UpdateLocationSchema = z.object({
  lat: latField('lat'),
  lng: lngField('lng'),
});
export type UpdateLocationDto = z.infer<typeof UpdateLocationSchema>;

// ── POST /api/v1/rides/search ─────────────────────────────────────────────────
export const SearchRideSchema = z.object({
  pickupLat: latField('pickupLat'),
  pickupLng: lngField('pickupLng'),
});
export type SearchRideDto = z.infer<typeof SearchRideSchema>;

// ── POST /api/v1/rides/estimate ───────────────────────────────────────────────
export const EstimateFareSchema = z.object({
  pickupLat: latField('pickupLat'),
  pickupLng: lngField('pickupLng'),
  dropoffLat: latField('dropoffLat'),
  dropoffLng: lngField('dropoffLng'),
});
export type EstimateFareDto = z.infer<typeof EstimateFareSchema>;

// ── POST /api/v1/rides/request ────────────────────────────────────────────────
export const RequestRideSchema = z.object({
  pickupLat: latField('pickupLat'),
  pickupLng: lngField('pickupLng'),
  pickupAddress: z.string({ error: 'pickupAddress is required' }).min(1, 'pickupAddress cannot be empty'),
  dropoffLat: latField('dropoffLat'),
  dropoffLng: lngField('dropoffLng'),
  dropoffAddress: z.string({ error: 'dropoffAddress is required' }).min(1, 'dropoffAddress cannot be empty'),
  vehicleType: z.nativeEnum(VehicleType, {
    error: `vehicleType must be one of: ${Object.values(VehicleType).join(', ')}`,
  }),
  estimatedFare: z
    .number({ error: 'estimatedFare must be a number' })
    .positive('estimatedFare must be a positive number'),
});
export type RequestRideDto = z.infer<typeof RequestRideSchema>;
