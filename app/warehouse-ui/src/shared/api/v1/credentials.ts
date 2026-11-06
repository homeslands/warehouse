/**
 * Nơi DUY NHẤT giữ thông tin xác thực v1 phía client.
 *
 * - Access token: CHỈ trong memory (D14 §1: "Access JWT 15 phút chỉ trong memory"). Reload trang
 *   = mất, lấy lại bằng refresh.
 * - Refresh token: cookie HttpOnly `wh_refresh` do server đặt — JS KHÔNG đọc, KHÔNG lưu (D14 §1,
 *   UI-01 "refresh cookie không hiển thị hoặc lưu localStorage").
 * - `csrfToken` (+ `sessionId`, cờ `locked`): localStorage `warehouse.auth.v1`. Lý do:
 *   1. refresh sau khi reload trang cần header `X-CSRF-Token` mà OpenAPI chỉ trả trong `LoginResult`;
 *   2. tab khác refresh (rotation) thì token cũ hết hiệu lực — mọi tab phải đọc cùng một bản mới;
 *   3. sự kiện `storage` đồng bộ khoá/đăng xuất giữa các tab (D14 §2).
 *   CSRF token không phải credential: một mình nó không refresh được (cần cookie HttpOnly + Origin
 *   allowlist). CẦN BE xác nhận cách lưu này (xem handoff M02 — PR draft BE có cookie `wh_csrf`
 *   đọc được, DEV-197-08, chưa vào hợp đồng R2).
 *
 * Module KHÔNG gắn listener lúc nạp: cờ `apiV1Auth` tắt thì không có hành vi runtime nào.
 */

export const V1_SESSION_STORAGE_KEY = 'warehouse.auth.v1'

/**
 * Mốc tương tác gần nhất ĐÃ BÁO server (`POST /auth/activity`), dùng chung giữa các tab: tab không
 * được thao tác không được tự khoá cả phiên khi người dùng đang làm ở tab khác (idle là của phiên).
 */
export const V1_ACTIVITY_STORAGE_KEY = 'warehouse.auth.v1.activity'

export type V1PersistedSession = {
  csrfToken: string
  sessionId: string
  /** Phiên đang bị khoá (idle/lock) — tab khác đọc để cùng hiện màn khoá. */
  locked: boolean
}

let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

function parse(raw: string | null): V1PersistedSession | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { csrfToken, sessionId, locked } = value as Record<string, unknown>
    if (typeof csrfToken !== 'string' || csrfToken === '') return null
    if (typeof sessionId !== 'string' || sessionId === '') return null
    return { csrfToken, sessionId, locked: locked === true }
  } catch {
    return null
  }
}

/** Đọc phải chịu được storage bị chặn (chế độ riêng tư…) — gọi trên mọi request 401. */
export function readPersistedSession(): V1PersistedSession | null {
  try {
    return parse(localStorage.getItem(V1_SESSION_STORAGE_KEY))
  } catch {
    return null
  }
}

/** Không nuốt lỗi: đăng nhập mà không lưu được CSRF thì reload sẽ mất phiên — phải thất bại rõ. */
export function writePersistedSession(session: V1PersistedSession): void {
  localStorage.setItem(V1_SESSION_STORAGE_KEY, JSON.stringify(session))
}

/** Đăng xuất / phiên chết: xoá cả memory lẫn storage. Không ném lỗi vì storage bị chặn. */
export function clearCredentials(): void {
  accessToken = null
  try {
    localStorage.removeItem(V1_SESSION_STORAGE_KEY)
    localStorage.removeItem(V1_ACTIVITY_STORAGE_KEY)
  } catch {
    // Bỏ qua.
  }
}

/** Mốc (epoch ms) tab nào đó vừa báo activity; `null` = chưa có / storage bị chặn. */
export function readSharedActivityAt(): number | null {
  try {
    const value = Number(localStorage.getItem(V1_ACTIVITY_STORAGE_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function writeSharedActivityAt(at: number): void {
  try {
    localStorage.setItem(V1_ACTIVITY_STORAGE_KEY, String(at))
  } catch {
    // Bỏ qua: chỉ mất đồng bộ idle giữa các tab.
  }
}

/** Khoá (idle/lock): bỏ access token khỏi memory, đánh dấu `locked` để tab khác cùng khoá. */
export function markCredentialsLocked(): void {
  accessToken = null
  const current = readPersistedSession()
  if (current === null) return
  try {
    writePersistedSession({ ...current, locked: true })
  } catch {
    // Bỏ qua: tab này vẫn khoá; chỉ mất đồng bộ sang tab khác.
  }
}

/**
 * Lắng nghe thay đổi từ TAB KHÁC (`storage` chỉ bắn ở tab không ghi). `null` = tab kia đã xoá
 * (đăng xuất / phiên chết) hoặc gọi `localStorage.clear()`.
 */
export function subscribeCrossTab(listener: (session: V1PersistedSession | null) => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== V1_SESSION_STORAGE_KEY) return
    listener(readPersistedSession())
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
