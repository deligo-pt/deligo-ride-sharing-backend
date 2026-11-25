import type { Request } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import { BadRequestError } from '../../utils/errors';
import { DEFAULT_UPLOAD_FOLDER, type UploadFolder } from './upload.constant';
import { UploadService } from './upload.service';

const resolveFolder = (req: Request): UploadFolder => {
  const body = req.body as { folder?: UploadFolder } | undefined;
  const query = req.query as { folder?: UploadFolder };
  return body?.folder ?? query.folder ?? DEFAULT_UPLOAD_FOLDER;
};

const uploadSingle = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError('Please attach a file in the "file" field.', undefined, 'NO_FILE');
  }

  const result = await UploadService.uploadSingleFile(req.file, resolveFolder(req));

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'File uploaded successfully',
    data: result,
  });
});

const uploadMultiple = catchAsync(async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    throw new BadRequestError(
      'Please attach at least one file in the "files" field.',
      undefined,
      'NO_FILES',
    );
  }

  const results = await UploadService.uploadMultipleFiles(files, resolveFolder(req));

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: `${results.length} file(s) uploaded successfully`,
    data: results,
  });
});

export const UploadController = {
  uploadSingle,
  uploadMultiple,
};
