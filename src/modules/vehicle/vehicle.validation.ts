import { z } from "zod";
import { VehicleClass, VehicleType } from "@prisma/client";

// ─── ISO date string helper ───────────────────────────────────────────────────
const isoDate = z
  .string()
  .datetime({ message: "Must be a valid ISO 8601 date (e.g. 2030-12-31T00:00:00Z)" })
  .optional();

// ─── POST /api/v1/vehicles ────────────────────────────────────────────────────
// Driver creates their vehicle with full information.

const createVehicleSchema = z.object({
  body: z.object({
    vehicleClass: z.nativeEnum(VehicleClass, {
      error: `vehicleClass must be one of: ${Object.values(VehicleClass).join(", ")}`,
    }),
    vehicleType: z.nativeEnum(VehicleType, {
      error: `vehicleType must be one of: ${Object.values(VehicleType).join(", ")}`,
    }),
    brand: z.string().min(1, "Vehicle brand is required"),
    model: z.string().min(1, "Vehicle model is required"),
    year: z
      .number({ error: "Year must be a number" })
      .int()
      .min(1990, "Manufacturing year must be 1990 or later")
      .max(new Date().getFullYear() + 1, "Manufacturing year cannot be in the future"),
    color: z.string().min(1, "Vehicle color is required"),
    licensePlate: z.string().min(1, "License plate number is required"),
    capacity: z.number().int().positive().optional(),
    registrationExpiryDate: isoDate,
    insuranceExpiryDate: isoDate,
  }),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>["body"];

// ─── PATCH /api/v1/vehicles/:id ───────────────────────────────────────────────
// Driver updates their vehicle information (all fields optional).

const updateVehicleSchema = z.object({
  body: createVehicleSchema.shape.body.partial(),
});

export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>["body"];

// ─── PATCH /api/v1/vehicles/:id/review ───────────────────────────────────────
// Admin approves, rejects, or suspends a vehicle registration.

const reviewVehicleSchema = z.object({
  body: z
    .object({
      approvalStatus: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
      adminNote: z.string().optional(),
    })
    .refine(
      (data) => data.approvalStatus === "APPROVED" || !!data.adminNote,
      {
        message: "adminNote is required when rejecting or suspending a vehicle",
        path: ["adminNote"],
      }
    ),
});

export type ReviewVehicleInput = z.infer<typeof reviewVehicleSchema>["body"];

// ─── GET /api/v1/vehicles (ADMIN) ─────────────────────────────────────────────
const listVehiclesQuerySchema = z.object({
  status: z.string().optional(),
});

export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;

// ─── Grouped validation (consumed by validateRequest in vehicle.route.ts) ─────

export const VehicleValidation = {
  create: { body: createVehicleSchema.shape.body },
  update: { body: updateVehicleSchema.shape.body },
  review: { body: reviewVehicleSchema.shape.body },
  list: { query: listVehiclesQuerySchema },
};
