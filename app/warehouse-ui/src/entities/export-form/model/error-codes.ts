import { isApiError, isVersionConflict } from '@/shared/api/http'

/** `EXPORT_FORM_NOT_FOUND` (404). */
export const EXPORT_FORM_NOT_FOUND = 101401
/** `EXPORT_FORM_NOT_DRAFT` (409) — phiếu đã gửi duyệt / xác nhận / huỷ trong lúc mình đang xem. */
export const EXPORT_FORM_NOT_DRAFT = 101415
/** `EXPORT_FORM_NOT_OWNER` (403) — chỉ có quyền `_OWN` mà phiếu của người khác. */
export const EXPORT_FORM_NOT_OWNER = 101416
/** `EXPORT_FORM_NOT_PENDING` (409) — xác nhận phiếu chưa gửi duyệt (hoặc đã xử lý rồi). */
export const EXPORT_FORM_NOT_PENDING = 101437

/** `INVENTORY_AVAILABLE_INSUFFICIENT` (409) — tồn khả dụng của kho (tồn − giữ chỗ) không đủ. */
export const INVENTORY_AVAILABLE_INSUFFICIENT = 100817
/** `MATERIAL_BATCH_INSUFFICIENT` (409) — số khả dụng (còn − giữ chỗ) của các lô không đủ. */
export const MATERIAL_BATCH_INSUFFICIENT = 101502

/**
 * Phiếu trong tay đã cũ: version lệch (409), phiếu không còn (101401), không còn DRAFT (101415),
 * không còn PENDING (101437) hoặc không còn là chủ phiếu (101416).
 * Thiếu hàng (100817 / 101502) cũng là 409 nhưng phiếu vẫn mới → KHÔNG tính là cũ.
 */
export function isStaleExportFormError(error: unknown): boolean {
  return (
    isVersionConflict(error) ||
    (isApiError(error) &&
      (error.code === EXPORT_FORM_NOT_FOUND ||
        error.code === EXPORT_FORM_NOT_DRAFT ||
        error.code === EXPORT_FORM_NOT_PENDING ||
        error.code === EXPORT_FORM_NOT_OWNER))
  )
}

/** Gửi duyệt / xác nhận thất bại vì không đủ hàng (tồn kho hoặc lô). */
export function isShortageError(error: unknown): boolean {
  return (
    isApiError(error) &&
    (error.code === INVENTORY_AVAILABLE_INSUFFICIENT || error.code === MATERIAL_BATCH_INSUFFICIENT)
  )
}
