import type { TFunction } from 'i18next'

import { isApiError } from '@/shared/api/http'
import { errorMessage } from '@/shared/api/error-message'

/** Mã lỗi khi tải hết danh sách mà vượt trần số trang (`fetchAllPages`). */
export const TOO_MANY_PAGES = 'inventory-too-many-pages'

/** Câu lỗi cho màn tồn kho: lỗi vượt trần trang có câu riêng, còn lại như `errorMessage`. */
export function inventoryErrorMessage(e: unknown, t: TFunction): string {
  if (e instanceof Error && e.message === TOO_MANY_PAGES) return t('inventory:tooManyPages')
  return errorMessage(e, t)
}

/**
 * Lỗi lưu ngưỡng → key i18n (đủ namespace, dùng với `t(key)`). 100809/100810/100811, 404 (vật tư
 * không còn trong kho), 403 (thiếu quyền); còn lại câu chung.
 */
export function thresholdErrorKey(e: unknown): string {
  if (!isApiError(e)) return 'errors:unknown'
  if (e.code === 100809) return 'inventory:thresholdMinInvalid'
  if (e.code === 100810) return 'inventory:thresholdMaxInvalid'
  if (e.code === 100811) return 'inventory:thresholdRange'
  if (e.statusCode === 404) return 'inventory:thresholdNotInWarehouse'
  if (e.statusCode === 403) return 'errors:permissionDenied'
  return 'errors:unknown'
}
