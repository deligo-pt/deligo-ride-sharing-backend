import { z } from 'zod';

const updateCustomerBodySchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  homeAddress: z.string().optional(),
  workAddress: z.string().optional(),
  emergencyContactNumber: z.string().optional(),
});

const updateDriverBodySchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  isAvailable: z.boolean().optional(),
  currentLatitude: z.number().optional(),
  currentLongitude: z.number().optional(),
});

export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerBodySchema>;
export type UpdateDriverProfileInput = z.infer<typeof updateDriverBodySchema>;

export const ProfileValidation = {
  /** PATCH /profile/me — the body schema depends on the caller's role. */
  updateMyProfile: {
    customer: { body: updateCustomerBodySchema },
    driver: { body: updateDriverBodySchema },
  },
};
