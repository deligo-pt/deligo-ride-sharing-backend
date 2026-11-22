import { Router } from "express";
import { handleGetMyProfile, handleUpdateMyProfile } from "./profile.controller";
import { authenticate } from "../../middlewares/auth";

const router: Router = Router();

// GET /api/v1/profile/me — fetch own profile (role-aware)
router.get("/me", authenticate, handleGetMyProfile);

// PATCH /api/v1/profile/me — update own profile (role-aware)
router.patch("/me", authenticate, handleUpdateMyProfile);

export default router;
