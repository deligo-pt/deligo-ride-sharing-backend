import { z } from 'zod';

const CreateReviewSchema = z.object({
  rideId: z.string({ error: 'rideId is required' }).uuid('rideId must be a valid UUID'),

  rating: z
    .number({ error: 'rating is required and must be a number' })
    .int('rating must be an integer')
    .min(1, 'rating must be at least 1')
    .max(5, 'rating cannot exceed 5'),

  comment: z.string().max(500, 'comment cannot exceed 500 characters').optional(),
});

export type CreateReviewDto = z.infer<typeof CreateReviewSchema>;

export const ReviewValidation = {
  create: { body: CreateReviewSchema },
};
