export enum Extension {
  EXCEL = 'xlsx',
  PDF = 'pdf',
  WORD = 'docx',
  JPG = 'jpg',
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
  EXCEL_LEGACY = 'xls',
  WORD_LEGACY = 'doc',
}

/** Tên field multipart của `POST /file/upload`. */
export const FILE_UPLOAD_FIELD_NAME = 'file';
/** Cỡ tối đa được NHẬN (tính cả biên): file đúng 10 485 760 byte vẫn qua. */
export const FILE_UPLOAD_MAX_SIZE = 10 * 1024 * 1024; // 10MB
/**
 * Giá trị truyền vào `limits.fileSize` của multer. busboy 1.6 báo vượt giới hạn khi số byte CHẠM
 * `fileSize` (`fileSize === limit`), nên phải +1 thì file đúng `FILE_UPLOAD_MAX_SIZE` mới qua.
 */
export const FILE_UPLOAD_MULTER_SIZE_LIMIT = FILE_UPLOAD_MAX_SIZE + 1;
export const FILE_UPLOAD_MAX_COUNT = 1;

const JPEG_MIME_TYPES = ['image/jpeg'] as const;

/**
 * Allowlist của `POST /file/upload`: đuôi (chữ thường, không dấu chấm) → mimetype được phép đi kèm
 * đuôi đó. File phải khớp CẢ HAI — đổi đuôi hoặc khai mimetype khác đều bị chặn.
 *
 * Tập mimetype phải bằng `IMPORT_FORM_UPLOAD_ALLOWED_MIME_TYPES` (route upload của phiếu nhập/xuất,
 * chỉ kiểm mimetype) — `file.util.spec.ts` khoá điều này. Không import chéo: module `file` là hạ tầng
 * `@Global`, không phụ thuộc module nghiệp vụ.
 *
 * Dùng `Map` thay vì object literal: tra bằng đuôi do client gửi (`x.constructor`, `x.__proto__`)
 * trên object sẽ trúng thuộc tính của prototype.
 */
export const FILE_UPLOAD_ALLOWED_TYPES: ReadonlyMap<string, readonly string[]> = new Map<
  string,
  readonly string[]
>([
  [Extension.PDF, ['application/pdf']],
  [Extension.JPG, JPEG_MIME_TYPES],
  [Extension.JPEG, JPEG_MIME_TYPES],
  [Extension.PNG, ['image/png']],
  [Extension.WEBP, ['image/webp']],
  [Extension.EXCEL, ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']],
  [Extension.EXCEL_LEGACY, ['application/vnd.ms-excel']],
  [Extension.WORD, ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  [Extension.WORD_LEGACY, ['application/msword']],
]);
