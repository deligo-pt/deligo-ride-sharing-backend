import { Router } from "express";
import { requireAuth } from "../../middlewares/mockAuth";
import { kycUpload } from "../../middlewares/uploadMiddleware";
import {
  handleCreateVehicle,
  handleGetMyVehicle,
  handleGetAllVehicles,
  handleUpdateMyVehicle,
  handleUploadVehiclePhotos,
  handleReviewVehicle,
} from "./vehicle.controller";

const router = Router();

// ─── Driver Routes ─────────────────────────────────────────────────────────────

// POST   /api/v1/vehicles           - Register a vehicle (DRIVER only)
router.post("/", requireAuth, handleCreateVehicle);

// GET    /api/v1/vehicles/me        - Get own vehicle with approval status (DRIVER)
router.get("/me", requireAuth, handleGetMyVehicle);

// PATCH  /api/v1/vehicles           - Update vehicle info; resets to PENDING_REVIEW (DRIVER)
router.patch("/", requireAuth, handleUpdateMyVehicle);

// POST   /api/v1/vehicles/photos    - Upload up to 5 vehicle photos (DRIVER)
router.post("/photos", requireAuth, kycUpload.array("photos", 5), handleUploadVehiclePhotos);

// ─── Admin Routes ──────────────────────────────────────────────────────────────

// GET    /api/v1/vehicles           - List all vehicles; ?status=PENDING_REVIEW (ADMIN)
router.get("/", requireAuth, handleGetAllVehicles);

// PATCH  /api/v1/vehicles/:id/review - Approve / Reject / Suspend a vehicle (ADMIN)
router.patch("/:id/review", requireAuth, handleReviewVehicle);

export default router;
