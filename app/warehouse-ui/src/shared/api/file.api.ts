import { http } from './http'
import type { ApiResponse } from './types'

/** FE tự chặn trước khi gửi — backend chưa giới hạn kích thước upload. */
export const FILE_MAX_BYTES = 10 * 1024 * 1024

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
