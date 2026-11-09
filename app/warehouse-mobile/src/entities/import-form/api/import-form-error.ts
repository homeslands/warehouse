import type { TFunction } from 'i18next'

import { DATA_VERSION_CONFLICT_CODE } from '@/shared/api/error-codes'
import { errorMessage } from '@/shared/api/error-message'
import { isApiError } from '@/shared/api/http'

/** Hạn dùng của một dòng trước ngày phiếu — backend có mã này nhưng `error-codes.ts` (bản chép web) chưa có. */
export const EXPIRY_BEFORE_DATE_CODE = 101333

/** Phiếu không còn trên server (`importFormNotFound`). */
const IMPORT_FORM_NOT_FOUND_CODE = 101301

/** 101301 không còn · 101314 không còn Nháp · 101315 không phải người lập. */
const STALE_CODES: readonly number[] = [
  DATA_VERSION_CONFLICT_CODE,
  IMPORT_FORM_NOT_FOUND_CODE,
  101314,
  101315,
]

/** Câu lỗi cho thao tác phiếu nhập: 101333 có câu riêng, còn lại như `errorMessage`. */
export function importFormErrorMessage(e: unknown, t: TFunction): string {
  if (isApiError(e) && e.code === EXPIRY_BEFORE_DATE_CODE) return t('importForms:expiryBeforeDate')
  return errorMessage(e, t)
}

/** Phiếu đã đổi / không còn sửa được trên server → tải lại, không tự gửi lại. */
export function isStaleImportFormError(e: unknown): boolean {
  return isApiError(e) && e.code !== undefined && STALE_CODES.includes(e.code)
}

/** Phiếu không còn trên server (bị xoá). */
export function isImportFormNotFoundError(e: unknown): boolean {
  return isApiError(e) && e.code === IMPORT_FORM_NOT_FOUND_CODE
}
