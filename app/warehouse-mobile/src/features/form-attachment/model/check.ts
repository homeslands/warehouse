import { ERROR_CODE_KEYS } from '@/shared/api/error-codes'
import { isApiError, type UploadFile } from '@/shared/api/http'

/** Cỡ tối đa backend nhận (`IMPORT_FORM_UPLOAD_MAX_SIZE` / `EXPORT_FORM_UPLOAD_MAX_SIZE`). */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

/** Loại tài liệu (không phải ảnh) backend nhận — cũng là bộ lọc của bộ chọn tệp. */
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

/** Mọi MIME backend nhận (kiểm `file.mimetype`, không kiểm đuôi). HEIC KHÔNG có. */
export const ATTACHMENT_MIME_TYPES: readonly string[] = [
  ...DOCUMENT_MIME_TYPES,
  'image/jpeg',
  'image/png',
  'image/webp',
]

export type AttachmentProblem = 'tooLarge' | 'badType'

/**
 * Kiểm trước khi tải lên. Thiếu / lạ `mimeType` → `'badType'` (backend sẽ từ chối); thiếu `size` thì
 * không chặn theo cỡ (backend vẫn kiểm). Sai loại báo trước quá cỡ.
 */
export function checkAttachment({
  size,
  mimeType,
}: {
  size?: number | null
  mimeType?: string | null
}): AttachmentProblem | null {
  if (!mimeType || !ATTACHMENT_MIME_TYPES.includes(mimeType)) return 'badType'
  if (size != null && size > ATTACHMENT_MAX_BYTES) return 'tooLarge'
  return null
}

/** File sắp gửi + cỡ (nếu biết) để `checkAttachment`. `mimeType` null = loại không gửi được. */
export type PickedFile = Omit<UploadFile, 'mimeType'> & {
  mimeType: string | null
  size: number | null
}

/** Đuôi file ĐÃ XUẤT của image-picker → MIME; đuôi khác (heic, gif, bmp…) → `null`. */
const IMAGE_EXT: Readonly<Record<string, { mime: string; ext: string }>> = {
  jpg: { mime: 'image/jpeg', ext: 'jpg' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
  webp: { mime: 'image/webp', ext: 'webp' },
}

/**
 * Ảnh của image-picker → file gửi đi: `chung-tu-<timestamp>.jpg`, `image/jpeg` (mặc định của chụp /
 * thư viện với `quality` < 1). Loại lấy theo đuôi `uri` (file app vừa ghi ra), KHÔNG theo
 * `asset.mimeType`: Android báo MIME của ảnh GỐC (vd `image/heic`) dù file xuất đã nén lại JPEG.
 * Backend lấy đuôi S3 từ tên file nên tên phải có đuôi đúng loại.
 */
export function imageUploadFile(
  asset: { uri: string; fileSize?: number | null; mimeType?: string | null },
  now: Date = new Date(),
): PickedFile {
  const ext = /\.([a-z0-9]+)$/i.exec(asset.uri.split('?')[0]!)?.[1]?.toLowerCase() ?? ''
  const known = IMAGE_EXT[ext]
  return {
    uri: asset.uri,
    name: `chung-tu-${now.getTime()}.${known?.ext ?? 'jpg'}`,
    mimeType: known?.mime ?? null,
    size: asset.fileSize ?? null,
  }
}

/** Đuôi theo MIME tài liệu — khi tên file bộ chọn trả về không có đuôi. */
const DOCUMENT_EXT: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

/** MIME ảnh → đuôi (đuôi gắn khi tên không có đuôi đã biết). */
const IMAGE_EXT_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** MIME nhận → đuôi gắn vào tên khi tên không có đuôi đã biết. */
const EXT_BY_MIME: Readonly<Record<string, string>> = { ...DOCUMENT_EXT, ...IMAGE_EXT_BY_MIME }

/** Đuôi (chữ thường) → MIME, khớp bảng cặp đuôi–MIME của backend (`FILE_UPLOAD_ALLOWED_TYPES`). */
const MIME_BY_EXT: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime])),
  jpeg: 'image/jpeg',
}

/**
 * Tệp của document-picker → file gửi đi. Backend (từ 2026-11-05) bắt đuôi tên VÀ MIME khớp một cặp:
 * - Đuôi đã biết (pdf/xls/xlsx/doc/docx/jpg/jpeg/png/webp) → MIME theo đuôi, bỏ MIME bộ chọn báo
 *   (Android hay báo `application/octet-stream`, thiếu, hoặc lệch).
 * - Không có đuôi đã biết nhưng MIME báo hợp lệ → giữ MIME, gắn đuôi theo MIME vào CẢ tên.
 * - Còn lại → `mimeType: null` (= `badType`).
 * Chấm thừa trong phần tên đổi thành `-` (backend cũ lấy đuôi theo dấu chấm thứ hai).
 */
export function documentUploadFile(asset: {
  uri: string
  name: string
  mimeType?: string | null
  size?: number | null
}): PickedFile {
  const dot = asset.name.lastIndexOf('.')
  const ext = dot > 0 ? asset.name.slice(dot + 1) : ''
  const byExt = MIME_BY_EXT[ext.toLowerCase()]
  const reported = asset.mimeType ?? null
  let base = asset.name
  let finalExt: string | undefined
  let mimeType: string | null = null
  if (byExt) {
    base = asset.name.slice(0, dot)
    finalExt = ext
    mimeType = byExt
  } else if (reported && EXT_BY_MIME[reported]) {
    finalExt = EXT_BY_MIME[reported]
    mimeType = reported
  }
  const safeBase = base.replace(/\./g, '-')
  return {
    uri: asset.uri,
    name: finalExt ? `${safeBase}.${finalExt}` : safeBase,
    mimeType,
    size: asset.size ?? null,
  }
}

/** Mã lỗi backend → câu của chứng từ (khoá trong `common:attachment.*`). */
const ERROR_KEY_PROBLEM: Readonly<Record<string, AttachmentProblem>> = {
  fileSizeExceedsLimitAllowed: 'tooLarge',
  importFormFileTypeInvalid: 'badType',
}

/**
 * Lỗi tải lên → khoá câu báo: quá cỡ (121001 / HTTP 413), sai loại (101329 — mã của phiếu nhập; mã
 * phiếu xuất 101434 chưa có trong `ERROR_CODE_KEYS`), còn lại (mạng, hết giờ, mã khác) → `uploadFailed`.
 */
export function uploadErrorKey(e: unknown): AttachmentProblem | 'uploadFailed' {
  if (!isApiError(e)) return 'uploadFailed'
  if (e.statusCode === 413) return 'tooLarge'
  const key = e.code === undefined ? undefined : ERROR_CODE_KEYS[e.code]
  return (key && ERROR_KEY_PROBLEM[key]) || 'uploadFailed'
}
