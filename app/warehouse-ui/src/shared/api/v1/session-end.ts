import type { SessionEndReason } from '@/shared/api/types'
import { ApiV1Error, V1ProtocolError } from './errors'

/**
 * `errorKey` v1 → lý do kết thúc phiên (R2-1 của review M01: bảng purge legacy gắn mã số
 * 100002–100005; v1 phân loại bằng `errorKey`).
 *
 * NGUỒN: OpenAPI R2 KHÔNG liệt kê giá trị `errorKey` (chỉ `type: string`). Tên dưới đây lấy từ
 * PR draft BE #239/#240 (#197 I-02a/I-02b) — CHƯA là hợp đồng đã chốt. BE đổi tên thì sửa đúng bảng
 * này; khoá lạ rơi về mặc định theo HTTP status ở `sessionEndReasonForV1` (không đoán từ message).
 *
 * "Terminal": phiên trên server đã chết vì lý do này — request được bảo vệ nhận 401 với khoá này thì
 * KHÔNG thử refresh (refresh cũng sẽ bị từ chối, và gọi thêm chỉ tốn rate limit refresh).
 */
export const V1_SESSION_END_KEYS: ReadonlyMap<string, SessionEndReason> = new Map<
  string,
  SessionEndReason
>([
  /** Server idle 30 phút (business-rules §Auth/RBAC, D14 §2) → UI-02, giữ draft cho cùng user. */
  ['SESSION_IDLE_EXPIRED', 'idle'],
  /** `POST /auth/lock` đã khoá phiên (tab khác/thiết bị khác cùng phiên) → UI-02. */
  ['SESSION_LOCKED', 'locked'],
  /** Logout/logout-all/thu hồi từ UI-04 hoặc admin → purge (UI-04). */
  ['SESSION_REVOKED', 'revoked'],
  /** Refresh token cũ bị dùng lại → server revoke cả family (TC-AUTH-05) → purge. */
  ['SESSION_REFRESH_TOKEN_REUSED', 'revoked'],
  /** Tài khoản bị vô hiệu → purge. */
  ['SESSION_USER_INACTIVE', 'userInactive'],
  /** Phiên quá tuổi tối đa (refresh ≤7 ngày) → login, giữ draft như `expired` legacy. */
  ['SESSION_EXPIRED', 'expired'],
])

/** Lỗi tạm thời — KHÔNG kết thúc phiên: mất mạng, hết giờ, 408, 429 (rate limit), 5xx. */
function isTransientStatus(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500
}

/**
 * Lý do kết thúc phiên cho một lỗi v1 (của refresh, hoặc của request được bảo vệ sau khi đã
 * refresh). `null` = lỗi tạm thời, giữ phiên.
 */
export function sessionEndReasonForV1(error: unknown): SessionEndReason | null {
  if (error instanceof ApiV1Error) {
    if (isTransientStatus(error.statusCode)) return null
    return V1_SESSION_END_KEYS.get(error.errorKey) ?? 'unauthorized'
  }
  if (error instanceof V1ProtocolError) {
    // Body lệch hợp đồng: chỉ còn status để dựa vào. 401/403 không rõ khoá → `unauthorized`.
    if (isTransientStatus(error.status)) return null
    return error.status === 401 || error.status === 403 ? 'unauthorized' : null
  }
  return null
}

/** Request được bảo vệ nhận 401 với khoá terminal → kết thúc phiên ngay, không refresh. */
export function terminalReasonFor(error: unknown): SessionEndReason | null {
  if (!(error instanceof ApiV1Error) || error.statusCode !== 401) return null
  return V1_SESSION_END_KEYS.get(error.errorKey) ?? null
}

/** Lý do dẫn tới màn khoá UI-02 (giữ draft trong memory) thay vì màn đăng nhập UI-01. */
export function isLockReason(reason: SessionEndReason | null): reason is 'idle' | 'locked' {
  return reason === 'idle' || reason === 'locked'
}
