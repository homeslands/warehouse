import path from 'path';
import { Request } from 'express';
import { FileFilterCallback } from 'multer';
import { FILE_UPLOAD_ALLOWED_TYPES } from './file.constant';
import { FileException } from './file.exception';
import { FileValidation } from './file.validation';

export function generateFileName(extension: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '_');
  return `${timestamp}.${extension.replace('.', '')}`;
}

/**
 * `fileFilter` của multer cho `POST /file/upload`: chỉ nhận file có đuôi VÀ mimetype cùng khớp
 * `FILE_UPLOAD_ALLOWED_TYPES`. Mimetype do client khai (không đọc nội dung file), nên đây là rào
 * allowlist, không phải kiểm tra nội dung. Lỗi trả qua `callback` để `CustomFileInterceptor` ném
 * nguyên `FileException` (422).
 */
export function uploadFileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback,
): void {
  const extension = path.extname(file.originalname).slice(1).toLowerCase();
  const allowedMimeTypes = FILE_UPLOAD_ALLOWED_TYPES.get(extension);
  if (!allowedMimeTypes?.includes(file.mimetype.toLowerCase())) {
    callback(new FileException(FileValidation.FILE_TYPE_NOT_ALLOWED));
    return;
  }
  callback(null, true);
}
