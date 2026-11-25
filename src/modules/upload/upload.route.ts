import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { uploadRateLimiter } from '../../middlewares/rateLimiter';
import { uploadMiddleware } from '../../middlewares/uploadMiddleware';
import { validateRequest } from '../../middlewares/validateRequest';
import { MAX_MULTIPLE_FILES } from './upload.constant';
import { UploadController } from './upload.controller';
import { UploadValidation } from './upload.validation';

const router: Router = Router();

router.post(
  '/',
  authenticate,
  uploadRateLimiter,
  uploadMiddleware.single('file'),
  validateRequest(UploadValidation.upload),
  UploadController.uploadSingle,
);

router.post(
  '/multiple',
  authenticate,
  uploadRateLimiter,
  uploadMiddleware.array('files', MAX_MULTIPLE_FILES),
  validateRequest(UploadValidation.upload),
  UploadController.uploadMultiple,
);

export const uploadRouter = router;
