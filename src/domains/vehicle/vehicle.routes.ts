import { Router } from "express";
import { handleCreateVehicle, handleGetVehicles, handleUpdateVehicle, handleDeleteVehicle } from "./vehicle.controller";
import { requireAuth } from "../../middlewares/mockAuth";

const router = Router();

// Retrieve vehicles (role-based)
router.get("/", requireAuth, handleGetVehicles);

// Create a new vehicle for a driver
router.post("/", requireAuth, handleCreateVehicle);

// Update a vehicle (Driver only)
router.patch("/:id", requireAuth, handleUpdateVehicle);

// Delete a vehicle (Admin or Driver for their own vehicle)
router.delete("/:id", requireAuth, handleDeleteVehicle);

export default router;
