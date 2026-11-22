import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary SDK Configuration
//
// Configured lazily on first use so missing env vars produce a clear runtime
// error rather than crashing the server at startup for unrelated requests.
// ─────────────────────────────────────────────────────────────────────────────

let _configured = false;

function configureCloudinary(): void {
  if (_configured) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file."
    );
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  _configured = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// uploadToCloudinary
//
// Streams a file buffer directly to Cloudinary and returns the upload result.
//   folder       — Cloudinary folder (e.g. "kyc-documents")
//   buffer       — Raw file buffer from multer's memory storage
//   originalname — Original file name, used to derive the resource type hint
//   mimeType     — MIME type of the file (e.g. "image/jpeg", "application/pdf")
// ─────────────────────────────────────────────────────────────────────────────

export interface CloudinaryUploadResult {
  /** Permanent public URL of the uploaded asset */
  secureUrl: string;
  /** Cloudinary public ID (use this for deletions/transformations) */
  publicId: string;
  /** File format returned by Cloudinary (e.g. "jpg", "pdf") */
  format: string;
  /** File size in bytes */
  bytes: number;
  /** Cloudinary resource type ("image" | "video" | "raw") */
  resourceType: string;
}

export const uploadToCloudinary = (
  buffer: Buffer,
  folder: string,
  mimeType: string
): Promise<CloudinaryUploadResult> => {
  configureCloudinary();

  // PDFs and other non-image files must use resourceType "raw" or "auto".
  // Using "auto" lets Cloudinary detect the correct type automatically.
  const resourceType = mimeType.startsWith("image/") ? "image" : "auto";

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType as "image" | "video" | "raw" | "auto",
        use_filename: false,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) {
          return reject(
            error instanceof Error
              ? error
              : new Error(error?.message ?? "Cloudinary upload returned no result."),
          );
        }
        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          bytes: result.bytes,
          resourceType: result.resource_type,
        });
      }
    );

    // Pipe the in-memory buffer into the Cloudinary upload stream
    const readable = Readable.from(buffer);
    readable.pipe(uploadStream);
  });
};
