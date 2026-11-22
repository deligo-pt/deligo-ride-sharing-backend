import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { kycUpload } from "../../middlewares/uploadMiddleware";
import {
  handleCreateVehicle,
  handleGetMyVehicle,
  handleGetAllVehicles,
  handleUpdateMyVehicle,
  handleUploadVehiclePhotos,
  handleReviewVehicle,
} from "./vehicle.controller";

const router: Router = Router();

// ─── Driver Routes ─────────────────────────────────────────────────────────────

// POST   /api/v1/vehicles           - Register a vehicle (DRIVER only)
router.post("/", authenticate, handleCreateVehicle);

// GET    /api/v1/vehicles/me        - Get own vehicle with approval status (DRIVER)
router.get("/me", authenticate, handleGetMyVehicle);

// PATCH  /api/v1/vehicles           - Update vehicle info; resets to PENDING_REVIEW (DRIVER)
router.patch("/", authenticate, handleUpdateMyVehicle);

// POST   /api/v1/vehicles/photos    - Upload up to 5 vehicle photos (DRIVER)
router.post("/photos", authenticate, kycUpload.array("photos", 5), handleUploadVehiclePhotos);

// ─── Admin Routes ──────────────────────────────────────────────────────────────

// GET    /api/v1/vehicles           - List all vehicles; ?status=PENDING_REVIEW (ADMIN)
router.get("/", authenticate, handleGetAllVehicles);

// PATCH  /api/v1/vehicles/:id/review - Approve / Reject / Suspend a vehicle (ADMIN)
router.patch("/:id/review", authenticate, handleReviewVehicle);

export default router;
