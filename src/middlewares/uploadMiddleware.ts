import multer, { FileFilterCallback } from "multer";
import { Request } from "express";

// ─────────────────────────────────────────────────────────────────────────────
// KYC Document Upload Middleware (Multer — Memory Storage)
//
// Files are held in memory as Buffer objects so we can stream them directly
// to Cloudinary without touching the disk. The 10 MB limit is a sensible
// cap for identity documents (license, insurance scans, etc.).
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type "${file.mimetype}". Only JPEG, PNG, WEBP, and PDF are allowed.`
      )
    );
  }
};

export const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter,
});
