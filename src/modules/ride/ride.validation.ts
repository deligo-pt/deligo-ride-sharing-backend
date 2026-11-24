import { z } from 'zod';
import { RideStatus, VehicleType } from '@prisma/client';

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

const StopSchema = z.object({
  address: z.string({ error: 'address is required' }).min(1, 'address cannot be empty'),
  lat: latField('stop.lat'),
  lng: lngField('stop.lng'),
});
export type StopDto = z.infer<typeof StopSchema>;

const UpdateLocationSchema = z.object({
  lat: latField('lat'),
  lng: lngField('lng'),
});
export type UpdateLocationDto = z.infer<typeof UpdateLocationSchema>;

const SearchRideSchema = z.object({
  pickupLat: latField('pickupLat'),
  pickupLng: lngField('pickupLng'),
});
export type SearchRideDto = z.infer<typeof SearchRideSchema>;

const EstimateFareSchema = z.object({
  pickupLat: latField('pickupLat'),
  pickupLng: lngField('pickupLng'),
  dropoffLat: latField('dropoffLat'),
  dropoffLng: lngField('dropoffLng'),
  vehicleType: z
    .nativeEnum(VehicleType, {
      error: `vehicleType must be one of: ${Object.values(VehicleType).join(', ')}`,
    })
    .optional(),
  promoCode: z.string().optional(),
  stops: z.array(StopSchema).max(5, 'A maximum of 5 intermediate stops is allowed').optional(),
});
export type EstimateFareDto = z.infer<typeof EstimateFareSchema>;

const RequestRideSchema = z.object({
  pickupLat: latField('pickupLat'),
  pickupLng: lngField('pickupLng'),
  pickupAddress: z
    .string({ error: 'pickupAddress is required' })
    .min(1, 'pickupAddress cannot be empty'),
  dropoffLat: latField('dropoffLat'),
  dropoffLng: lngField('dropoffLng'),
  dropoffAddress: z
    .string({ error: 'dropoffAddress is required' })
    .min(1, 'dropoffAddress cannot be empty'),
  vehicleType: z.nativeEnum(VehicleType, {
    error: `vehicleType must be one of: ${Object.values(VehicleType).join(', ')}`,
  }),
  estimatedFare: z
    .number({ error: 'estimatedFare must be a number' })
    .positive('estimatedFare must be a positive number'),
  stops: z.array(StopSchema).max(5, 'A maximum of 5 intermediate stops is allowed').optional(),
  scheduledAt: z
    .string()
    .datetime({ message: 'scheduledAt must be a valid ISO 8601 datetime string' })
    .refine((v) => new Date(v).getTime() > Date.now() + 31 * 60 * 1000, {
      message: 'scheduledAt must be at least 30 minutes in the future',
    })
    .transform((v) => new Date(v))
    .optional(),
});
export type RequestRideDto = z.infer<typeof RequestRideSchema>;

const UpdateRideStatusSchema = z.object({
  status: z.enum(['DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED'], {
    error: 'status must be one of: DRIVER_ARRIVED, IN_PROGRESS, COMPLETED',
  }),
  finalDistanceKm: z.number({ error: 'finalDistanceKm must be a number' }).positive().optional(),
  finalDurationMinutes: z
    .number({ error: 'finalDurationMinutes must be a number' })
    .int()
    .positive()
    .optional(),
  actualDistanceKm: z.number({ error: 'actualDistanceKm must be a number' }).positive().optional(),
  actualDurationMinutes: z
    .number({ error: 'actualDurationMinutes must be a number' })
    .positive()
    .optional(),
  tolls: z.number({ error: 'tolls must be a number' }).min(0).optional(),
  waitingTimeMinutes: z.number({ error: 'waitingTimeMinutes must be a number' }).min(0).optional(),
});
export type UpdateRideStatusDto = z.infer<typeof UpdateRideStatusSchema>;

const CancelRideSchema = z.object({
  reason: z.string({ error: 'reason is required' }).min(1, 'reason cannot be empty'),
});
export type CancelRideDto = z.infer<typeof CancelRideSchema>;

const RecurringProfileSchema = z.object({
  vehicleType: z.enum(
    ['Hatchback', 'Micro', 'Sedan', 'SUV', 'Motorcycle', 'PickupTruck'] as const,
    {
      error: 'vehicleType must be a valid VehicleType',
    },
  ),

  pickupAddress: z.string().min(1, 'pickupAddress is required'),
  pickupLat: z.number().min(-90).max(90),
  pickupLng: z.number().min(-180).max(180),

  dropoffAddress: z.string().min(1, 'dropoffAddress is required'),
  dropoffLat: z.number().min(-90).max(90),
  dropoffLng: z.number().min(-180).max(180),

  daysOfWeek: z.array(z.int().min(1).max(7)).min(1, 'At least one day of week is required').max(7),

  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/, 'timeOfDay must be in HH:MM format'),

  startDate: z
    .string()
    .datetime({ message: 'startDate must be a valid ISO 8601 datetime' })
    .transform((v) => new Date(v)),

  endDate: z
    .string()
    .datetime({ message: 'endDate must be a valid ISO 8601 datetime' })
    .transform((v) => new Date(v)),
});

export type RecurringProfileDto = z.infer<typeof RecurringProfileSchema>;

const ListRidesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(RideStatus).optional(),
  userId: z.string().min(1).optional(),
});
export type ListRidesQuery = z.infer<typeof ListRidesQuerySchema>;

const RideIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

const AdminCancelRideSchema = z.object({
  reason: z.string().min(5).max(500),
});
export type AdminCancelRideInput = z.infer<typeof AdminCancelRideSchema>;

export const RideValidation = {
  adminCancelRide: { params: RideIdParamSchema, body: AdminCancelRideSchema },
  listRides: { query: ListRidesQuerySchema },
  getRide: { params: RideIdParamSchema },
  updateLocation: { body: UpdateLocationSchema },
  searchRide: { body: SearchRideSchema },
  estimateFare: { body: EstimateFareSchema },
  requestRide: { body: RequestRideSchema },
  updateRideStatus: { body: UpdateRideStatusSchema },
  cancelRide: { body: CancelRideSchema },
  createRecurringProfile: { body: RecurringProfileSchema },
};
