import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { config } from '../config';

let _configured = false;

function configureCloudinary(): void {
  if (_configured) return;

  const { cloudName, apiKey, apiSecret } = config.cloudinary;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.',
    );
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  _configured = true;
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  format: string;
  bytes: number;
  resourceType: string;
}

export const uploadToCloudinary = (
  buffer: Buffer,
  folder: string,
  mimeType: string,
): Promise<CloudinaryUploadResult> => {
  configureCloudinary();

  const resourceType = mimeType.startsWith('image/') ? 'image' : 'auto';

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType as 'image' | 'video' | 'raw' | 'auto',
        use_filename: false,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) {
          return reject(
            error instanceof Error
              ? error
              : new Error(error?.message ?? 'Cloudinary upload returned no result.'),
          );
        }
        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          bytes: result.bytes,
          resourceType: result.resource_type,
        });
      },
    );

    const readable = Readable.from(buffer);
    readable.pipe(uploadStream);
  });
};
