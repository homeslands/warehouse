import { isApiError, isVersionConflict } from '@/shared/api/http'

/** `IMPORT_FORM_NOT_FOUND` (404). */
export const IMPORT_FORM_NOT_FOUND = 101301
/** `IMPORT_FORM_NOT_DRAFT` (409) — phiếu đã xác nhận / huỷ trong lúc mình đang xem. */
export const IMPORT_FORM_NOT_DRAFT = 101314
/** `IMPORT_FORM_NOT_OWNER` (403) — chỉ có quyền `_OWN` mà phiếu của người khác. */
export const IMPORT_FORM_NOT_OWNER = 101315

/** Phiếu trong tay đã cũ: version lệch (409), không còn DRAFT (101314) hoặc không còn là chủ phiếu (101315). */
export function isStaleImportFormError(error: unknown): boolean {
  return (
    isVersionConflict(error) ||
    (isApiError(error) &&
      (error.code === IMPORT_FORM_NOT_DRAFT || error.code === IMPORT_FORM_NOT_OWNER))
  )
}
