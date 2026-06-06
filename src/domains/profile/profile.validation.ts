import { z } from "zod";

export const updateCustomerProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    homeAddress: z.string().optional(),
    workAddress: z.string().optional(),
    emergencyContactNumber: z.string().optional(),
  }),
});

export const updateDriverProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    isAvailable: z.boolean().optional(),
    currentLatitude: z.number().optional(),
    currentLongitude: z.number().optional(),
  }),
});

export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerProfileSchema>["body"];
export type UpdateDriverProfileInput = z.infer<typeof updateDriverProfileSchema>["body"];
