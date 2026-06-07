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
  vehicleType: z.nativeEnum(VehicleType, {
    error: `vehicleType must be one of: ${Object.values(VehicleType).join(', ')}`,
  }).optional(),
  promoCode: z.string().optional(),
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

// ── PATCH /api/v1/rides/:id/accept ───────────────────────────────────────────
// No body required — the ride ID and driver identity come from params + headers.

// ── PATCH /api/v1/rides/:id/status ───────────────────────────────────────────
export const UpdateRideStatusSchema = z.object({
  status: z.enum(['DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED'], {
    error: 'status must be one of: DRIVER_ARRIVED, IN_PROGRESS, COMPLETED',
  }),
  // Legacy fields (kept for backwards compat)
  finalDistanceKm: z.number({ error: 'finalDistanceKm must be a number' }).positive().optional(),
  finalDurationMinutes: z.number({ error: 'finalDurationMinutes must be a number' }).int().positive().optional(),
  // PRD 3.7 actuals for final fare calculation
  actualDistanceKm: z.number({ error: 'actualDistanceKm must be a number' }).positive().optional(),
  actualDurationMinutes: z.number({ error: 'actualDurationMinutes must be a number' }).positive().optional(),
  tolls: z.number({ error: 'tolls must be a number' }).min(0).optional(),
  waitingTimeMinutes: z.number({ error: 'waitingTimeMinutes must be a number' }).min(0).optional(),
});
export type UpdateRideStatusDto = z.infer<typeof UpdateRideStatusSchema>;

// ── POST /api/v1/rides/:id/cancel ────────────────────────────────────────────
export const CancelRideSchema = z.object({
  reason: z.string({ error: 'reason is required' }).min(1, 'reason cannot be empty'),
});
export type CancelRideDto = z.infer<typeof CancelRideSchema>;

// ── POST /api/v1/rides/:id/share ─────────────────────────────────────────────
// No body required. The rideId comes from the URL param, auth from headers.
// (Schema kept as empty object so it's consistent with the rest of the file)
export const ShareRideSchema = z.object({});
export type ShareRideDto = z.infer<typeof ShareRideSchema>;
