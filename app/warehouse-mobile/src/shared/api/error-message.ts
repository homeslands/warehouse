import axios from 'axios'
import type { TFunction } from 'i18next'

import { ERROR_CODE_KEYS } from './error-codes'
import { isApiError, isPermissionDenied } from './http'

/**
 * Lỗi bất kỳ → câu hiển thị cho người dùng. Cùng sơ đồ khoá với web (`resolveApiErrorMessage`):
 * `code` → `errors:<khoá>` qua `ERROR_CODE_KEYS`.
 *
 * Khác web ở hai chỗ: lỗi không có response (mất mạng, hết giờ) báo `common:offline` thay vì
 * `errors:network`; mã lạ rơi về `errors:unknown` thay vì message tiếng Anh của backend, vì người
 * dùng ở đây là nhân viên kho, không phải lập trình viên.
 *
 * Interceptor reject bằng `ApiError` khi có response, bằng chính AxiosError khi không có.
 */
export function errorMessage(e: unknown, t: TFunction): string {
  if (axios.isAxiosError(e) && !e.response) return t('common:offline')
  if (!isApiError(e)) return t('errors:unknown')
  if (isPermissionDenied(e)) return t('errors:permissionDenied')

  const key = e.code === undefined ? undefined : ERROR_CODE_KEYS[e.code]
  if (key === undefined) {
    console.warn(
      `[api-error] Mã lỗi ${String(e.code)} chưa có trong ERROR_CODE_KEYS: "${e.message}"`,
    )
    return t('errors:unknown')
  }
  return t(`errors:${key}`)
}
