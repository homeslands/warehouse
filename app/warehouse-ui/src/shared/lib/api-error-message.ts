import i18n from '@/shared/i18n'
import { ERROR_CODE_KEYS } from '@/shared/api/error-codes'
import { isApiError } from '@/shared/api/http'

/**
 * Hàm thuần, KHÔNG phải hook — dùng được cả trong render lẫn trong callback của react-query.
 * Dùng `i18n.t` trực tiếp vì `useTranslation` chỉ gọi được trong component.
 */
export function resolveApiErrorMessage(error: unknown): string {
  if (!isApiError(error)) return i18n.t('errors:network')

  const key = error.code === undefined ? undefined : ERROR_CODE_KEYS[error.code]

  if (key === undefined) {
    // Không nuốt thành "Đã có lỗi xảy ra": đây là công cụ nội bộ, một câu tiếng Anh cụ thể
    // hữu ích hơn một câu tiếng Việt vô nghĩa. Cảnh báo để lập trình viên bổ sung khoá.
    console.warn(
      `[api-error] Mã lỗi ${String(error.code)} chưa có trong ERROR_CODE_KEYS. ` +
        `Dùng message của backend: "${error.message}"`,
    )
    return error.message || i18n.t('errors:unknown')
  }

  return i18n.t(`errors:${key}`)
}
