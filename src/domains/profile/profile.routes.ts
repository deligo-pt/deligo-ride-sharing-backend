import { Router } from "express";
import { handleGetMyProfile, handleUpdateMyProfile } from "./profile.controller";
import { requireAuth } from "../../middlewares/mockAuth";

const router = Router();

// GET /api/v1/profile/me — fetch own profile (role-aware)
router.get("/me", requireAuth, handleGetMyProfile);

// PATCH /api/v1/profile/me — update own profile (role-aware)
router.patch("/me", requireAuth, handleUpdateMyProfile);

export default router;
