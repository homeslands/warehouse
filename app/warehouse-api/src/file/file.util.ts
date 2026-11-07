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
 * Đuôi (lấy từ tên client gửi) VÀ mimetype phải cùng khớp một cặp trong `FILE_UPLOAD_ALLOWED_TYPES`.
 * Rule dùng chung cho `POST /file/upload` và route upload của phiếu nhập/xuất. Mimetype do client
 * khai (không đọc nội dung file) ⇒ đây là rào allowlist, không phải kiểm tra nội dung.
 */
export function isAllowedUploadType(
  originalname: string | undefined,
  mimetype: string | undefined,
): boolean {
  const extension = path
    .extname(originalname ?? '')
    .slice(1)
    .toLowerCase();
  const allowedMimeTypes = FILE_UPLOAD_ALLOWED_TYPES.get(extension);
  return !!allowedMimeTypes?.includes((mimetype ?? '').toLowerCase());
}

/**
 * `fileFilter` của multer cho `POST /file/upload` theo `isAllowedUploadType`. Lỗi trả qua `callback`
 * để `CustomFileInterceptor` ném nguyên `FileException` (422).
 */
export function uploadFileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback,
): void {
  if (!isAllowedUploadType(file.originalname, file.mimetype)) {
    callback(new FileException(FileValidation.FILE_TYPE_NOT_ALLOWED));
    return;
  }
  callback(null, true);
}
