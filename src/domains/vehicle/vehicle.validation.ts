import { z } from "zod";
import { VehicleClass, VehicleType } from "@prisma/client";

export const createVehicleSchema = z.object({
  body: z.object({
    vehicleClass: z.nativeEnum(VehicleClass),
    vehicleType: z.nativeEnum(VehicleType),
    brand: z.string().min(1, "Brand is required"),
    model: z.string().min(1, "Model is required"),
    year: z.number().int().min(1900, "Invalid year").max(new Date().getFullYear() + 1),
    color: z.string().min(1, "Color is required"),
    licensePlate: z.string().min(1, "License plate is required"),
    capacity: z.number().int().positive().optional(),
  }),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>["body"];

export const updateVehicleSchema = z.object({
  body: createVehicleSchema.shape.body.partial(),
});

export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>["body"];
