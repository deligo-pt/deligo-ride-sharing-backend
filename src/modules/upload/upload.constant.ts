export const ALLOWED_UPLOAD_FOLDERS = [
  'kyc-documents',
  'vehicle-photos',
  'avatars',
  'fleet-documents',
  'support-attachments',
] as const;

export type UploadFolder = (typeof ALLOWED_UPLOAD_FOLDERS)[number] | 'general';

export const DEFAULT_UPLOAD_FOLDER = 'general' satisfies UploadFolder;

export const MAX_MULTIPLE_FILES = 10;
