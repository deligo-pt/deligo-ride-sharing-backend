import { z } from 'zod';

const TripHistoryQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().positive('page must be a positive integer')),

  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 10))
    .pipe(
      z
        .number()
        .int()
        .positive('limit must be a positive integer')
        .max(100, 'limit cannot exceed 100'),
    ),
});

export type TripHistoryQuery = z.infer<typeof TripHistoryQuerySchema>;

export const DriverValidation = {
  tripHistory: { query: TripHistoryQuerySchema },
};
