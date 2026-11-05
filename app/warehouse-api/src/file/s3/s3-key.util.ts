import { randomUUID } from 'crypto';
import path from 'path';

/** Độ dài tối đa của phần tên (đã làm sạch) trong key S3, chưa tính hậu tố ngẫu nhiên và đuôi. */
export const OBJECT_KEY_NAME_MAX_LENGTH = 64;

/** Độ dài tối đa của đuôi file (không tính dấu chấm); dài hơn thì cắt bớt. */
export const OBJECT_KEY_EXTENSION_MAX_LENGTH = 16;

/** Tên dùng khi tên gốc không còn ký tự an toàn nào sau khi làm sạch. */
export const OBJECT_KEY_FALLBACK_NAME = 'file';

const COMBINING_MARKS = /[̀-ͯ]/g;
const UNSAFE_NAME_CHARS = /[^a-z0-9_-]+/g;
const UNSAFE_EXTENSION_CHARS = /[^a-z0-9]+/g;
const REPEATED_DASHES = /-{2,}/g;
const EDGE_SEPARATORS = /^[-_]+|[-_]+$/g;

/** Bỏ dấu tiếng Việt/unicode (NFD + bỏ dấu kết hợp; `đ` không tách được nên đổi tay), về chữ thường. */
function toAsciiLower(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function sanitizeName(name: string): string {
  const cleaned = toAsciiLower(name)
    .replace(UNSAFE_NAME_CHARS, '-')
    .replace(REPEATED_DASHES, '-')
    .replace(EDGE_SEPARATORS, '')
    .slice(0, OBJECT_KEY_NAME_MAX_LENGTH)
    .replace(EDGE_SEPARATORS, '');
  return cleaned || OBJECT_KEY_FALLBACK_NAME;
}

function sanitizeExtension(extension: string): string {
  return toAsciiLower(extension.slice(1))
    .replace(UNSAFE_EXTENSION_CHARS, '')
    .slice(0, OBJECT_KEY_EXTENSION_MAX_LENGTH);
}

/**
 * Tạo key S3 an toàn từ `originalname` do client gửi: `[folder/]<tên-sạch>-<hậu tố>[.<đuôi>]`.
 * - Bỏ phần đường dẫn (cả `/` lẫn `\`), lấy **đuôi cuối** (chữ thường); không có đuôi thì không gắn.
 * - Tên chỉ giữ `[a-z0-9_-]` (bỏ dấu unicode, ký tự khác thành `-`, gộp `-`), tối đa
 *   `OBJECT_KEY_NAME_MAX_LENGTH`, rỗng thì dùng `OBJECT_KEY_FALLBACK_NAME`.
 * - `suffix` mặc định là UUID ngẫu nhiên để các file cùng tên/cùng thời điểm không trùng key.
 * - `folder` là hằng nội bộ (không có `/` ở 2 đầu), giữ nguyên làm tiền tố.
 */
export function buildObjectKey(
  originalname: string,
  folder?: string,
  suffix: string = randomUUID(),
): string {
  const baseName = path.posix.basename((originalname ?? '').replace(/\\/g, '/'));
  const rawExtension = path.posix.extname(baseName);
  const name = sanitizeName(baseName.slice(0, baseName.length - rawExtension.length));
  const extension = sanitizeExtension(rawExtension);
  const objectName = extension ? `${name}-${suffix}.${extension}` : `${name}-${suffix}`;
  return folder ? `${folder}/${objectName}` : objectName;
}
