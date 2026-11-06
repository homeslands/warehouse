import { isApiError, http } from './http'
import type { ApiResponse } from './types'

/**
 * Giới hạn của `POST /file/upload` (BE #168): 1 file, tối đa 10 MB TÍNH CẢ BIÊN (10 485 760 byte vẫn
 * qua — warehouse-api `src/file/file.constant.ts` `FILE_UPLOAD_MAX_SIZE`). FE chặn trước để khỏi tải
 * lên vô ích; backend vẫn là chốt chặn (vượt → 422 / 121001).
 */
export const FILE_MAX_BYTES = 10 * 1024 * 1024

/**
 * Bản sao allowlist `FILE_UPLOAD_ALLOWED_TYPES` của backend (`src/file/file.constant.ts`): đuôi (chữ
 * thường) → mimetype đi kèm. Backend đòi khớp CẢ HAI (#184: đổi đuôi hoặc mimetype khác đều 422 /
 * 121012). Mimetype backend nhận là `file.type` trình duyệt gửi trong multipart (rỗng → trình duyệt
 * gửi `application/octet-stream` → bị chặn), nên kiểm trên `file.type` là cùng một luật.
 */
const UPLOAD_ALLOWED_TYPES: ReadonlyMap<string, readonly string[]> = new Map([
  ['pdf', ['application/pdf']],
  ['jpg', ['image/jpeg']],
  ['jpeg', ['image/jpeg']],
  ['png', ['image/png']],
  ['webp', ['image/webp']],
  ['xlsx', ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']],
  ['xls', ['application/vnd.ms-excel']],
  ['docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['doc', ['application/msword']],
])

/** Giá trị `accept` của `<input type="file">` cho `POST /file/upload` — chỉ là gợi ý cho hộp chọn file. */
export const FILE_UPLOAD_ACCEPT = [...UPLOAD_ALLOWED_TYPES.keys()].map((ext) => `.${ext}`).join(',')

/** Đuôi và mimetype của file có khớp một cặp backend cho phép không (không đọc nội dung file). */
export function isAllowedUploadFile(file: Pick<File, 'name' | 'type'>): boolean {
  const dot = file.name.lastIndexOf('.')
  const extension = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase()
  return UPLOAD_ALLOWED_TYPES.get(extension)?.includes(file.type.toLowerCase()) ?? false
}

/** Mã lỗi `FileValidation` của backend (`src/file/file.validation.ts`) mà ô upload xử lý riêng. */
export const FILE_ERROR_CODES = {
  /** `FILE_NOT_FOUND` — request không có file (field `file` trống). */
  missing: 121000,
  /** `FILE_SIZE_EXCEEDS_LIMIT_ALLOWED` — vượt 10 MB. */
  tooLarge: 121001,
  /** `FILE_TYPE_NOT_ALLOWED` — đuôi/mimetype ngoài allowlist hoặc không khớp nhau. */
  typeNotAllowed: 121012,
} as const

export type UploadErrorKind = keyof typeof FILE_ERROR_CODES | 'forbidden' | 'failed'

/**
 * Phân loại lỗi của `uploadFile` để ô upload hiện câu riêng. `403` = thiếu `FILE_CREATE` (guard trả 403
 * không `code`); mọi lỗi khác (mạng, 5xx, mã multer khác) → `failed`.
 */
export function uploadErrorKind(error: unknown): UploadErrorKind {
  if (!isApiError(error)) return 'failed'
  if (error.statusCode === 403) return 'forbidden'
  switch (error.code) {
    case FILE_ERROR_CODES.missing:
      return 'missing'
    case FILE_ERROR_CODES.tooLarge:
      return 'tooLarge'
    case FILE_ERROR_CODES.typeNotAllowed:
      return 'typeNotAllowed'
    default:
      return 'failed'
  }
}

/**
 * `POST /file/upload` KHÔNG trả key trong `result` — key chỉ nằm trong `message`
 * ("File <key> uploaded to S3 successfully"). Cô lập điểm lệch này ở đây; khi backend trả
 * `result: { key }` thì chỉ sửa file này. Xem `docs/proposals/2026-10-13-file-upload-api.md`.
 */
const UPLOADED_MESSAGE = /^File (.+) uploaded to S3 successfully$/

export function parseUploadedKey(message: string): string {
  const match = UPLOADED_MESSAGE.exec(message)
  if (!match) throw new Error(`Không đọc được key từ phản hồi upload: "${message}"`)
  return match[1]
}

/**
 * Ngoại lệ có chủ đích với luật "chỉ dùng getData/postData…": các helper đó chỉ trả `result`, mà key
 * nằm ở `message`. Vẫn đi qua instance `http` nên giữ interceptor token / refresh.
 */
export async function uploadFile(file: File): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const res = await http.post<ApiResponse<unknown>>('/file/upload', body)
  return parseUploadedKey(res.data.message)
}

/** Key backend dựng là `<tên>-<Date.now()>.<đuôi>` — bỏ hậu tố thời gian để hiện tên dễ đọc. */
export function fileDisplayName(key: string): string {
  return key.replace(/-\d{13}(\.[^./]*)?$/, '$1')
}
