import { deleteFromRustFS, uploadToRustFS } from '../../utils/rustfs.util';
import type { UploadFileResult } from './upload.interface';
import type { UploadFolder } from './upload.constant';

const toResult = (
  file: Express.Multer.File,
  stored: { key: string; url: string },
): UploadFileResult => ({
  key: stored.key,
  url: stored.url,
  originalName: file.originalname,
  mimetype: file.mimetype,
  size: file.size,
});

const uploadSingleFile = async (
  file: Express.Multer.File,
  folder: UploadFolder,
): Promise<UploadFileResult> => toResult(file, await uploadToRustFS(file, folder));

const uploadMultipleFiles = async (
  files: Express.Multer.File[],
  folder: UploadFolder,
): Promise<UploadFileResult[]> => {
  const settled = await Promise.allSettled(files.map((file) => uploadToRustFS(file, folder)));

  const failure = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) {
    await Promise.all(
      settled.flatMap((r) => (r.status === 'fulfilled' ? [deleteFromRustFS(r.value.key)] : [])),
    );
    throw failure.reason;
  }

  return settled.map((r, i) =>
    toResult(files[i], (r as PromiseFulfilledResult<{ key: string; url: string }>).value),
  );
};

export const UploadService = {
  uploadSingleFile,
  uploadMultipleFiles,
};
