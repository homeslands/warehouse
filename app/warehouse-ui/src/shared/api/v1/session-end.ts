import type { SessionEndReason } from '@/shared/api/types'
import { ApiV1Error, V1ProtocolError } from './errors'

/**
 * Phân loại lỗi auth v1 theo `errorKey` (R2-1 review M01: legacy dùng mã số 100002–100005).
 *
 * NGUỒN: trả lời BE Q1 trên #197 (07/11/2026, code PR draft #239/#240 @ `a11dcb7`). Đây là ĐỀ XUẤT
 * của BE (DEV-197-03/17) — R2 KHÔNG có enum `errorKey` (OpenAPI chỉ `type: string`). Khi danh sách
 * chính thức được chốt, sửa đúng các bảng dưới; test `session-end.test.ts` khoá nội dung để đổi phải
 * chủ động. Không bao giờ phân loại bằng `message`.
 */

/**
 * Nhóm "phiên đã chết" (401) → kết thúc phiên ngay, KHÔNG refresh (refresh cũng bị từ chối và chỉ tốn
 * rate limit). Lý do quyết định màn đích và purge (xem `app/client-state-lifecycle.ts`).
 */
export const V1_SESSION_END_KEYS: ReadonlyMap<string, SessionEndReason> = new Map<
  string,
  SessionEndReason
>([
  /** Logout/logout-all/thu hồi (UI-04, admin) → purge. */
  ['SESSION_REVOKED', 'revoked'],
  /** Server idle 30 phút (D14 §2) → UI-02, giữ draft cho cùng user. */
  ['SESSION_IDLE_EXPIRED', 'idle'],
  /** `POST /auth/lock` đã khoá phiên → UI-02. */
  ['SESSION_LOCKED', 'locked'],
  /** Phiên quá tuổi tối đa (refresh ≤ 7 ngày) → login, giữ draft như `expired` legacy. */
  ['SESSION_EXPIRED', 'expired'],
  /** Tài khoản bị vô hiệu → purge. */
  ['SESSION_USER_INACTIVE', 'userInactive'],
  /** Refresh token không hợp lệ → login, giữ draft (không có bằng chứng bị chiếm phiên). */
  ['SESSION_REFRESH_TOKEN_INVALID', 'unauthorized'],
  /** Refresh token cũ bị dùng lại → server revoke cả family (TC-AUTH-05, BE Q3) → purge. */
  ['SESSION_REFRESH_TOKEN_REUSED', 'revoked'],
  /** Không có / trùng cookie refresh → login, giữ draft. */
  ['GATEWAY_REFRESH_COOKIE_MISSING', 'unauthorized'],
  ['GATEWAY_REFRESH_COOKIE_CONFLICT', 'unauthorized'],
])

/** Access token hết hạn/thiếu/sai (401) → refresh MỘT lần rồi gửi lại. */
export const V1_REFRESH_ONCE_KEYS: ReadonlySet<string> = new Set([
  'SESSION_ACCESS_TOKEN_EXPIRED',
  'SESSION_ACCESS_TOKEN_MISSING',
  'SESSION_ACCESS_TOKEN_INVALID',
])

/** 403 KHÔNG phải lỗi phiên → giữ phiên (BE Q1). */
export const V1_KEEP_SESSION_403_KEYS: ReadonlySet<string> = new Set([
  'GATEWAY_ORIGIN_REJECTED',
  'GATEWAY_CSRF_INVALID',
  'RBAC_PERMISSION_DENIED',
])

/** 503 hạ tầng → lỗi tạm thời, không kết thúc phiên (mọi 5xx đã được coi là tạm thời). */
export const V1_INFRA_503_KEYS: ReadonlySet<string> = new Set([
  'STORAGE_CALLER_IDENTITY_REJECTED',
  'GATEWAY_CLIENT_IP_UNAVAILABLE',
  'SESSION_CLIENT_IP_MISSING',
  'SESSION_STORE_UNAVAILABLE',
])

/** Lỗi tạm thời — KHÔNG kết thúc phiên: mất mạng, hết giờ, 408, 429 (rate limit), 5xx. */
function isTransientStatus(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500
}

/**
 * Lý do kết thúc phiên cho một lỗi v1 (của refresh, hoặc của request được bảo vệ sau khi đã refresh
 * một lần). `null` = giữ phiên.
 * - Khoá thuộc nhóm "phiên đã chết" → lý do tương ứng (kể cả khi server trả 403).
 * - 403 khác (CSRF/Origin/RBAC hay khoá lạ) → giữ phiên: 403 không phải lỗi phiên (BE Q1).
 * - 401 khoá lạ → `unauthorized`.
 */
export function sessionEndReasonForV1(error: unknown): SessionEndReason | null {
  if (error instanceof ApiV1Error) {
    if (isTransientStatus(error.statusCode)) return null
    const mapped = V1_SESSION_END_KEYS.get(error.errorKey)
    if (mapped !== undefined) return mapped
    return error.statusCode === 401 ? 'unauthorized' : null
  }
  if (error instanceof V1ProtocolError) {
    // Body lệch hợp đồng: chỉ còn status. 401 → `unauthorized`; còn lại giữ phiên.
    return error.status === 401 ? 'unauthorized' : null
  }
  return null
}

/** Request được bảo vệ nhận 401 với khoá "phiên đã chết" → kết thúc phiên ngay, không refresh. */
export function terminalReasonFor(error: unknown): SessionEndReason | null {
  if (!(error instanceof ApiV1Error) || error.statusCode !== 401) return null
  return V1_SESSION_END_KEYS.get(error.errorKey) ?? null
}

/** Lý do dẫn tới màn khoá UI-02 (giữ draft trong memory) thay vì màn đăng nhập UI-01. */
export function isLockReason(reason: SessionEndReason | null): reason is 'idle' | 'locked' {
  return reason === 'idle' || reason === 'locked'
}
