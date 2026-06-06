import { Router } from "express";
import {
  handleGetKycRequirements,
  handleGetKycStatus,
  handleUploadDocuments,
  handleGetMyDocuments,
  handleGetPendingDocuments,
  handleGetAllDocuments,
  handleReviewDocument,
} from "./kyc.controller";
import { requireAuth } from "../../middlewares/mockAuth";
import { kycUpload } from "../../middlewares/uploadMiddleware";
import { REQUIRED_KYC_DOCUMENTS } from "./kyc.validation";

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────

// GET /api/v1/kyc/requirements
// Returns the static list of all 7 required KYC documents with labels and
// descriptions. No authentication required — for onboarding / info screens.
router.get("/requirements", handleGetKycRequirements);

// ─── Driver Routes ────────────────────────────────────────────────────────────

// GET /api/v1/kyc/status
// Driver: checklist showing upload & verification status for each of the 7 docs.
router.get("/status", requireAuth, handleGetKycStatus);

// POST /api/v1/kyc/documents  (BULK UPLOAD)
// Driver must send ALL 7 required documents as separate file fields in one
// multipart/form-data request. Field names must match DocumentType enum values:
//   DRIVING_LICENSE, NATIONAL_ID, VEHICLE_REGISTRATION, VEHICLE_INSURANCE,
//   DRIVER_SELFIE, PROOF_OF_ADDRESS, TAX_ID
// If any field is missing, the API returns a 400 with the full list of missing docs.
router.post(
  "/documents",
  requireAuth,
  kycUpload.fields(REQUIRED_KYC_DOCUMENTS.map((doc) => ({ name: doc.type, maxCount: 1 }))),
  handleUploadDocuments
);

// GET /api/v1/kyc/documents/me
// Driver: raw list of all uploaded documents.
router.get("/documents/me", requireAuth, handleGetMyDocuments);

// ─── Admin Routes ─────────────────────────────────────────────────────────────

// GET /api/v1/kyc/documents/pending
// Admin: fetch all documents with PENDING verification status.
router.get("/documents/pending", requireAuth, handleGetPendingDocuments);

// GET /api/v1/kyc/documents/all
// Admin: fetch ALL documents regardless of status (for full review panel).
router.get("/documents/all", requireAuth, handleGetAllDocuments);

// PATCH /api/v1/kyc/documents/:id/review
// Admin: approve or reject a specific document.
router.patch("/documents/:id/review", requireAuth, handleReviewDocument);

export default router;
