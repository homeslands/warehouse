import type { TFunction } from 'i18next'

import { DATA_VERSION_CONFLICT_CODE } from '@/shared/api/error-codes'
import { errorMessage } from '@/shared/api/error-message'
import { isApiError, isPermissionDenied } from '@/shared/api/http'

/** Phiếu không còn trên server. */
const NOT_FOUND_CODE = 101401
/** Phiếu không còn Nháp (sửa / xoá / gửi). */
const NOT_DRAFT_CODE = 101415
/** Không phải người lập. */
const NOT_OWNER_CODE = 101416
/** Không còn Chờ duyệt (xác nhận). */
const NOT_PENDING_CODE = 101437
/** Không còn Nháp / Chờ duyệt (huỷ). */
const CANNOT_BE_CANCELLED_CODE = 101438

/** `EXPORT_FORM_ITEM_BATCH_OUT_OF_STOCK` — lô đã chọn hết hàng (khi Lưu / tạo), không chỉ dòng. */
const ITEM_BATCH_OUT_OF_STOCK_CODE = 101432
/** `MATERIAL_BATCH_INSUFFICIENT` (warehouse-api src/material-batch) — lô không đủ tồn khả dụng. */
const BATCH_INSUFFICIENT_CODE = 101502
/** `INVENTORY_AVAILABLE_INSUFFICIENT` (warehouse-api src/inventory) — kho không đủ tồn khả dụng. */
const INVENTORY_INSUFFICIENT_CODE = 100817

/** Mã lỗi backend (export-form.validation.ts 1014xx + thiếu hàng) → khoá `exportForms:errors.*`. */
const ERROR_KEYS: Record<number, string> = {
  101401: 'notFound',
  101402: 'codeRequired',
  101403: 'codeInvalid',
  101404: 'codeExists',
  101405: 'codeReserved',
  101406: 'typeInvalid',
  101407: 'purchaseOrderRequired',
  101408: 'purchaseOrderInvalid',
  101409: 'invoiceCodeInvalid',
  101410: 'receiverRequired',
  101411: 'receiverInvalid',
  101412: 'totalInvalid',
  101413: 'fileInvalid',
  101414: 'statusInvalid',
  101415: 'notDraft',
  101416: 'notOwner',
  101417: 'warehouseInactive',
  101418: 'itemsRequired',
  101419: 'itemsTooMany',
  101420: 'itemMaterialRequired',
  101421: 'itemUnitRequired',
  101422: 'itemQuantityInvalid',
  101423: 'itemUnitPriceInvalid',
  101424: 'itemNoteInvalid',
  101425: 'itemDuplicated',
  101426: 'itemMaterialNotFound',
  101427: 'itemUnitNotOfMaterial',
  101428: 'itemConversionRateInvalid',
  101429: 'itemMaterialNotInWarehouse',
  101430: 'itemBatchNotFound',
  101431: 'itemBatchNotOfMaterial',
  [ITEM_BATCH_OUT_OF_STOCK_CODE]: 'itemBatchOutOfStock',
  101433: 'itemBatchInvalid',
  101434: 'fileTypeInvalid',
  101435: 'dateRangeInvalid',
  101436: 'codeSearchInvalid',
  101437: 'notPending',
  101438: 'cannotBeCancelled',
  [BATCH_INSUFFICIENT_CODE]: 'shortage',
  [INVENTORY_INSUFFICIENT_CODE]: 'shortage',
}

/** Phiếu đã đổi so với bản đang xem → tải lại, không tự gửi lại. Thiếu hàng (cũng 409) KHÔNG nằm đây. */
const STALE_CODES: readonly number[] = [
  DATA_VERSION_CONFLICT_CODE,
  NOT_FOUND_CODE,
  NOT_DRAFT_CODE,
  NOT_OWNER_CODE,
  NOT_PENDING_CODE,
  CANNOT_BE_CANCELLED_CODE,
]

/**
 * Câu lỗi cho thao tác phiếu xuất: mã 1014xx và thiếu hàng có câu riêng, còn lại như `errorMessage`.
 * `disposalConfirm`: đang xác nhận phiếu xuất huỷ — backend thiếu `EXPORT_FORM_APPROVE_DISPOSAL` ném
 * 403 trơn (không `code`, message mặc định của Nest), nên chỉ nơi gọi biết đó là lỗi duyệt xuất huỷ.
 */
export function exportFormErrorMessage(
  e: unknown,
  t: TFunction,
  opts: { disposalConfirm?: boolean } = {},
): string {
  if (isApiError(e) && e.code !== undefined) {
    const key = ERROR_KEYS[e.code]
    if (key) return t(`exportForms:errors.${key}`)
  }
  if (opts.disposalConfirm && isPermissionDenied(e)) {
    return t('exportForms:errors.approveDisposalDenied')
  }
  return errorMessage(e, t)
}

/** Không đủ tồn khả dụng ở lô (101502) hoặc kho (100817) khi gửi duyệt / xác nhận. */
export function isShortageError(e: unknown): boolean {
  return (
    isApiError(e) && (e.code === BATCH_INSUFFICIENT_CODE || e.code === INVENTORY_INSUFFICIENT_CODE)
  )
}

/** Lô đã chọn của một dòng hết hàng (101432, khi Lưu / tạo phiếu) — backend không nói dòng nào. */
export function isBatchOutOfStockError(e: unknown): boolean {
  return isApiError(e) && e.code === ITEM_BATCH_OUT_OF_STOCK_CODE
}

/** Phiếu không còn trên server (bị xoá). */
export function isExportFormNotFoundError(e: unknown): boolean {
  return isApiError(e) && e.code === NOT_FOUND_CODE
}

/** Phiếu không còn Nháp (đã được gửi duyệt / huỷ bởi người khác). */
export function isNotDraftError(e: unknown): boolean {
  return isApiError(e) && e.code === NOT_DRAFT_CODE
}

/** Phiếu đã đổi / không còn thao tác được trên server (409 `DATA_VERSION_CONFLICT`, không còn Nháp / Chờ duyệt, …). */
export function isStaleExportFormError(e: unknown): boolean {
  return isApiError(e) && e.code !== undefined && STALE_CODES.includes(e.code)
}
