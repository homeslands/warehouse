import { create } from 'zustand'

import { uploadExportFormFile } from '@/entities/export-form'
import { uploadImportFormFile } from '@/entities/import-form'
import type { UploadFile } from '@/shared/api/http'

/** Loại phiếu của chứng từ: chọn endpoint tải lên, và nút Lưu của luồng nào bị chặn. */
export type AttachmentKind = 'import' | 'export'

type UploadState = { uploading: Record<AttachmentKind, number> }

/**
 * Số lần tải chứng từ đang chạy theo loại phiếu. Cấp module (không theo màn): lần tải chạy tiếp khi
 * người dùng chuyển bước, và bước Lưu (`useReceiveActions` / `useExportActions`) đọc được từ ngoài React.
 */
const useUploadStore = create<UploadState>(() => ({ uploading: { import: 0, export: 0 } }))

const bump = (kind: AttachmentKind, by: 1 | -1) =>
  useUploadStore.setState((s) => ({
    uploading: { ...s.uploading, [kind]: Math.max(0, s.uploading[kind] + by) },
  }))

/** Đang có chứng từ của loại phiếu `kind` tải lên (đọc ngoài React). */
export function isAttachmentUploading(kind: AttachmentKind): boolean {
  return useUploadStore.getState().uploading[kind] > 0
}

/** `isAttachmentUploading` dạng hook (vẽ lại khi đổi). */
export function useAttachmentUploading(kind: AttachmentKind): boolean {
  return useUploadStore((s) => s.uploading[kind] > 0)
}

/** Chỉ dùng trong test. */
export function resetAttachmentUploads(): void {
  useUploadStore.setState({ uploading: { import: 0, export: 0 } })
}

export type UploadOutcome =
  | { status: 'done'; url: string }
  /** Tải xong nhưng bản nháp lúc bắt đầu không còn mở (bỏ nháp, rời luồng, đổi phiếu): bỏ kết quả. */
  | { status: 'stale' }
  | { status: 'error'; error: unknown }

/**
 * Tải một chứng từ lên, CHẠY NGOÀI vòng đời component (màn tháo ra cũng chạy nốt).
 * - Xong: gọi `onDone(url)` CHỈ KHI `getFormKey()` lúc xong `=== formKey` (khoá của bản nháp lúc bắt
 *   đầu); khác → `stale`, không gọi.
 * - Lỗi: trả `{ status: 'error' }` để UI báo; không gọi `onDone`. Khoá đã đổi → `stale` (không báo).
 * - Luôn tắt cờ đang tải (kể cả lỗi / stale).
 */
export async function startAttachmentUpload({
  kind,
  warehouseSlug,
  formKey,
  file,
  getFormKey,
  onDone,
}: {
  kind: AttachmentKind
  warehouseSlug: string
  formKey: string
  file: UploadFile
  getFormKey: () => string | null
  onDone: (url: string) => void
}): Promise<UploadOutcome> {
  bump(kind, 1)
  try {
    const upload = kind === 'import' ? uploadImportFormFile : uploadExportFormFile
    const url = await upload(warehouseSlug, file)
    if (getFormKey() !== formKey) return { status: 'stale' }
    onDone(url)
    return { status: 'done', url }
  } catch (error) {
    // Lỗi của bản nháp đã bỏ / đã rời: không báo lên bản nháp đang mở.
    if (getFormKey() !== formKey) return { status: 'stale' }
    return { status: 'error', error }
  } finally {
    bump(kind, -1)
  }
}
