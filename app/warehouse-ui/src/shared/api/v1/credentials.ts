/**
 * Nơi DUY NHẤT giữ thông tin xác thực v1 phía client.
 *
 * - Access token: CHỈ trong memory (D14 §1). Reload trang = mất, lấy lại bằng refresh.
 * - Refresh token: cookie HttpOnly `wh_refresh` do server đặt — JS KHÔNG đọc, KHÔNG lưu (D14 §1, UI-01).
 * - `csrfToken`: CHỈ trong memory (từ `LoginResult`). Sau reload đọc cookie CSRF do server đặt
 *   (`__Host-wh_csrf` khi HTTPS, `wh_csrf` chỉ khi HTTP dev), KHÔNG fallback tên khác và KHÔNG lưu
 *   localStorage. Nguồn: trả lời BE Q2 trên #197 (07/11/2026, DEV-197-08/20) — quyết định điều phối,
 *   CHỜ THẮNG xác nhận; R2 chưa có cookie CSRF.
 * - localStorage `warehouse.auth.v1` chỉ giữ MARKER `{ sessionId, locked }` để đồng bộ khoá/đăng xuất
 *   giữa các tab (D14 §2). Marker không mở được phiên: không có token/CSRF trong đó.
 *
 * Khoá (idle/lock): bỏ access + CSRF khỏi memory và xoá cookie CSRF → sửa marker rồi reload cũng không
 * refresh được (thiếu CSRF); mở khoá chỉ bằng `POST /auth/login` (BE Q5: không có endpoint unlock).
 *
 * Module KHÔNG gắn listener lúc nạp: cờ `apiV1Auth` tắt thì không có hành vi runtime nào.
 */

export const V1_SESSION_STORAGE_KEY = 'warehouse.auth.v1'

/**
 * Mốc tương tác gần nhất ĐÃ BÁO server (`POST /auth/activity`), dùng chung giữa các tab: tab không
 * được thao tác không được tự khoá cả phiên khi người dùng đang làm ở tab khác (idle là của phiên).
 */
export const V1_ACTIVITY_STORAGE_KEY = 'warehouse.auth.v1.activity'

export type V1SessionMarker = {
  sessionId: string
  /** Phiên đang bị khoá (idle/lock) — tab khác đọc để cùng hiện màn khoá. */
  locked: boolean
}

let accessToken: string | null = null
let csrfToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

/** Tên cookie CSRF theo BE Q2: HTTPS chỉ `__Host-wh_csrf` (subdomain không đặt được), HTTP dev `wh_csrf`. */
export function csrfCookieName(protocol: string = window.location.protocol): string {
  return protocol === 'https:' ? '__Host-wh_csrf' : 'wh_csrf'
}

/** Đọc ĐÚNG một tên cookie (không fallback). `null` khi không có / không đọc được (API khác origin). */
export function readCsrfCookie(
  cookie: string = document.cookie,
  protocol: string = window.location.protocol,
): string | null {
  const name = csrfCookieName(protocol)
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue
    const value = decodeURIComponent(part.slice(eq + 1).trim())
    return value === '' ? null : value
  }
  return null
}

/** Xoá cookie CSRF ở trình duyệt (khoá/kết thúc phiên) — cùng thuộc tính server đặt: `Path=/`. */
export function wipeCsrfCookie(protocol: string = window.location.protocol): void {
  const secure = protocol === 'https:' ? '; Secure' : ''
  try {
    document.cookie = `${csrfCookieName(protocol)}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
  } catch {
    // Bỏ qua: cookie bị chặn thì cũng không đọc được để refresh.
  }
}

/**
 * CSRF cho `POST /auth/refresh`: cookie trước (luôn là bản mới nhất, kể cả khi tab khác vừa rotate),
 * không đọc được cookie thì bản trong memory của chính tab này.
 */
export function resolveCsrfToken(): string | null {
  return readCsrfCookie() ?? csrfToken
}

function parse(raw: string | null): V1SessionMarker | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { sessionId, locked } = value as Record<string, unknown>
    if (typeof sessionId !== 'string' || sessionId === '') return null
    return { sessionId, locked: locked === true }
  } catch {
    return null
  }
}

/** Đọc phải chịu được storage bị chặn (chế độ riêng tư…) — gọi trên mọi request 401. */
export function readSessionMarker(): V1SessionMarker | null {
  try {
    return parse(localStorage.getItem(V1_SESSION_STORAGE_KEY))
  } catch {
    return null
  }
}

function writeSessionMarker(marker: V1SessionMarker): void {
  try {
    localStorage.setItem(V1_SESSION_STORAGE_KEY, JSON.stringify(marker))
  } catch {
    // Bỏ qua: chỉ mất đồng bộ giữa các tab; credential vẫn ở memory của tab này.
  }
}

/** Đăng nhập / refresh thành công: credential vào memory, marker `locked: false`. */
export function storeSessionCredentials(next: {
  accessToken: string
  csrfToken: string
  sessionId: string
}): void {
  accessToken = next.accessToken
  csrfToken = next.csrfToken
  writeSessionMarker({ sessionId: next.sessionId, locked: false })
}

/**
 * Khoá (mọi lý do): bỏ access + CSRF khỏi memory, xoá cookie CSRF; chỉ giữ marker `locked: true` để
 * tab khác cùng khoá. Không còn phiên (marker đã xoá) thì không tạo lại marker.
 */
export function lockCredentials(): void {
  accessToken = null
  csrfToken = null
  wipeCsrfCookie()
  const current = readSessionMarker()
  if (current !== null) writeSessionMarker({ ...current, locked: true })
}

/** Đăng xuất / phiên chết: xoá memory, cookie CSRF, marker và mốc activity. Không ném lỗi. */
export function clearCredentials(): void {
  accessToken = null
  csrfToken = null
  wipeCsrfCookie()
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

/**
 * Lắng nghe marker do TAB KHÁC ghi (`storage` chỉ bắn ở tab không ghi). `null` = tab kia đã xoá
 * (đăng xuất / phiên chết) hoặc gọi `localStorage.clear()`.
 */
export function subscribeCrossTab(listener: (marker: V1SessionMarker | null) => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== V1_SESSION_STORAGE_KEY) return
    listener(readSessionMarker())
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
