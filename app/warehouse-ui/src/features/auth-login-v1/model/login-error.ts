import i18n from '@/shared/i18n'
import { ApiV1Error, V1NetworkError, v1ErrorStatus, type V1LoginBody } from '@/shared/api/v1'

/** Field của form đăng nhập (`components.schemas.Login`). */
export type LoginV1Field = keyof V1LoginBody

const LOGIN_FIELDS: ReadonlySet<string> = new Set<LoginV1Field>(['phoneNumber', 'password'])

export type LoginV1Failure = {
  /** 422: lỗi gắn vào ô (thứ tự server trả — ô đầu tiên được focus). */
  fieldErrors: { field: LoginV1Field; message: string }[]
  /** Thông báo chung (role="alert"); `null` khi mọi lỗi đã gắn được vào ô. */
  alert: { message: string; traceId?: string } | null
}

/**
 * Lỗi đăng nhập → thứ form hiển thị. Theo screen-contracts UI-01 + quy tắc chung:
 * - 401/403: thông điệp CHUNG, không tiết lộ tài khoản có tồn tại hay bị khoá (TC-AUTH-02).
 * - 422: gắn `errors[]` vào ô tương ứng; field lạ (không có ô) rơi vào thông báo chung.
 * - 429: vượt giới hạn 20 lần/phút (TC-AUTH-08).
 * - Không có response: offline — không tự gửi lại.
 * - Còn lại (5xx, lệch hợp đồng): lỗi hệ thống, kèm `traceId` để tra log khi server có gửi.
 */
export function describeLoginV1Error(error: unknown): LoginV1Failure {
  const status = v1ErrorStatus(error)
  const traceId = error instanceof ApiV1Error ? error.traceId : undefined

  if (status === 401 || status === 403) {
    return { fieldErrors: [], alert: { message: i18n.t('auth:v1.invalidCredentials') } }
  }
  if (status === 429) {
    return { fieldErrors: [], alert: { message: i18n.t('auth:v1.rateLimited') } }
  }
  if (status === 422 && error instanceof ApiV1Error) {
    const fieldErrors = error.fieldErrors
      .filter((e) => LOGIN_FIELDS.has(e.field))
      .map((e) => ({ field: e.field as LoginV1Field, message: e.message }))
    const unmatched =
      error.fieldErrors.length === 0 || fieldErrors.length < error.fieldErrors.length
    return {
      fieldErrors,
      alert: unmatched ? { message: error.message, ...(traceId ? { traceId } : {}) } : null,
    }
  }
  if (error instanceof V1NetworkError || status === undefined) {
    return { fieldErrors: [], alert: { message: i18n.t('auth:v1.offline') } }
  }
  return {
    fieldErrors: [],
    alert: { message: i18n.t('auth:v1.unexpected'), ...(traceId ? { traceId } : {}) },
  }
}
