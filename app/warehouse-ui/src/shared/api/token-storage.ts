/**
 * Nơi DUY NHẤT đọc/ghi token. Không module nào khác được đụng localStorage cho token.
 *
 * Backend gửi refresh token trong body JSON (không dùng cookie httpOnly) nên frontend buộc phải tự
 * lưu nó — XSS đọc được. Khi backend chuyển sang cookie httpOnly, chỉ file này và lời gọi refresh
 * trong http.ts phải sửa. Xem docs/proposals/2026-09-17-refresh-token-httponly-cookie.md.
 */

export type TokenPair = { accessToken: string; refreshToken: string }

export const TOKEN_STORAGE_KEY = 'warehouse.auth'
const LEGACY_ACCESS_TOKEN_KEY = 'warehouse.accessToken'

type Listener = (pair: TokenPair | null) => void
const listeners = new Set<Listener>()

// Key cũ chỉ có access token, không có refresh token → không dùng được cho luồng refresh.
// Người dùng hiện tại đăng nhập lại đúng một lần.
// Bọc try/catch: storage có thể bị chặn (sandboxed iframe, chế độ riêng tư...) → bỏ qua, đừng để
// việc nạp module ném lỗi vì một dọn dẹp không quan trọng.
try {
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY)
} catch {
  // Bỏ qua.
}

function parse(raw: string | null): TokenPair | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { accessToken, refreshToken } = value as Record<string, unknown>
    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null
    if (accessToken === '' || refreshToken === '') return null
    return { accessToken, refreshToken }
  } catch {
    return null
  }
}

function notify(pair: TokenPair | null): void {
  listeners.forEach((listener) => listener(pair))
}

export function getTokens(): TokenPair | null {
  // Đọc phải chịu được storage bị chặn (sandboxed iframe, chế độ riêng tư...) — Task 24 gọi hàm
  // này trên MỌI request, nên nó không được ném lỗi.
  let raw: string | null
  try {
    raw = localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
  return parse(raw)
}

export function setTokens(pair: TokenPair): void {
  // Không bọc try/catch: đăng nhập mà không lưu được token phải thất bại rõ ràng, không âm thầm nuốt lỗi.
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(pair))
  notify(pair)
}

export function clearTokens(): void {
  // Đăng xuất không được phép ném lỗi vì storage bị chặn — vẫn phải notify(null) để state ứng
  // dụng luôn được dọn sạch dù localStorage không ghi được.
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // Bỏ qua.
  }
  notify(null)
}

// Sự kiện `storage` chỉ bắn ở CÁC TAB KHÁC khi một tab ghi localStorage.
// `key === null` nghĩa là tab kia gọi `localStorage.clear()` — token cũng mất.
window.addEventListener('storage', (event) => {
  if (event.key !== null && event.key !== TOKEN_STORAGE_KEY) return
  notify(getTokens())
})

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
