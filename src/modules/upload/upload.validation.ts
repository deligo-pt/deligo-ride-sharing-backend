import { z } from 'zod';
import { isStoredFileUrl } from '../../utils/rustfs.util';
import { ALLOWED_UPLOAD_FOLDERS, DEFAULT_UPLOAD_FOLDER } from './upload.constant';

const folderSchema = z
  .enum([...ALLOWED_UPLOAD_FOLDERS, DEFAULT_UPLOAD_FOLDER], {
    error: `folder must be one of: ${[...ALLOWED_UPLOAD_FOLDERS, DEFAULT_UPLOAD_FOLDER].join(', ')}`,
  })
  .optional();

const uploadBodySchema = z.object({ folder: folderSchema });
const uploadQuerySchema = z.object({ folder: folderSchema });

export type UploadBodyInput = z.infer<typeof uploadBodySchema>;

export const storedFileUrlSchema = (folder?: string): z.ZodString =>
  z
    .string({ error: 'Must be a URL returned by the upload API' })
    .url('Must be a valid URL')
    .refine((url) => isStoredFileUrl(url, folder), {
      message: folder
        ? `URL must point to the "${folder}" folder of our file storage (use POST /upload with folder="${folder}")`
        : 'URL must point to our file storage (use POST /upload)',
    });

export const UploadValidation = {
  upload: { body: uploadBodySchema, query: uploadQuerySchema },
};
