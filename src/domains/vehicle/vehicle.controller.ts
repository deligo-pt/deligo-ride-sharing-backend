import { Request, Response } from "express";
import { createVehicle, deleteVehicle, getVehicles, updateVehicle } from "./vehicle.service";
import { createVehicleSchema, updateVehicleSchema } from "./vehicle.validation";

export const handleCreateVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    
    // Validate request body
    const validatedData = createVehicleSchema.parse({ body: req.body }).body;

    // Call service
    const vehicle = await createVehicle(userId, validatedData);

    res.status(201).json({
      success: true,
      data: vehicle,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.errors[0]?.message || "Validation failed",
        }
      });
      return;
    }
    
    res.status(400).json({
      success: false,
      error: {
        code: "VEHICLE_CREATION_FAILED",
        message: error.message || "Failed to create vehicle",
      }
    });
  }
};

export const handleGetVehicles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, role } = req.user!;
    
    const vehicles = await getVehicles(id, role);

    res.status(200).json({
      success: true,
      data: vehicles,
    });
  } catch (error: any) {
    res.status(403).json({
      success: false,
      error: {
        code: "VEHICLE_RETRIEVAL_FAILED",
        message: error.message || "Failed to retrieve vehicles",
      }
    });
  }
};

export const handleUpdateVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: userId, role } = req.user!;
    const vehicleId = req.params.id as string;
    
    // Validate request bodys
    const validatedData = updateVehicleSchema.parse({ body: req.body }).body;

    // Call service
    const vehicle = await updateVehicle(vehicleId, userId, role, validatedData);

    res.status(200).json({
      success: true,
      data: vehicle,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.errors[0]?.message || "Validation failed",
        }
      });
      return;
    }
    
    res.status(400).json({
      success: false,
      error: {
        code: "VEHICLE_UPDATE_FAILED",
        message: error.message || "Failed to update vehicle",
      }
    });
  }
};

export const handleDeleteVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: userId, role } = req.user!;
    const vehicleId = req.params.id as string;
    
    await deleteVehicle(vehicleId, userId, role);

    res.status(200).json({
      success: true,
      data: { message: "Vehicle deleted successfully" },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        code: "VEHICLE_DELETION_FAILED",
        message: error.message || "Failed to delete vehicle",
      }
    });
  }
};
