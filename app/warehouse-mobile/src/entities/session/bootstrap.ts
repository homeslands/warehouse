import { REFRESH_TIMEOUT_MS, isApiError } from '@/shared/api/http'
import { getTokens, hydrateTokens } from '@/shared/api/token-storage'
import { getSessionEpoch, useAuthStore } from './auth.store'
import { fetchProfile } from './session.api'

/** Lỗi tạm thời: không có response dùng được, 5xx, 408, 429. Token vẫn có thể hợp lệ. */
function isTemporary(e: unknown): boolean {
  if (!isApiError(e)) return true
  return e.statusCode >= 500 || e.statusCode === 408 || e.statusCode === 429
}

/**
 * Chạy một lần lúc mở app. Đợi `hydrateTokens()` xong rồi mới gọi request (interceptor đọc token
 * đồng bộ). Access token hết hạn thì interceptor tự refresh bên trong `fetchProfile`, nên status đi
 * thẳng `loading → authenticated`, không qua `unauthenticated`.
 */
export async function bootstrapSession(): Promise<void> {
  const store = useAuthStore.getState()
  const tokens = await hydrateTokens()
  if (!tokens) {
    // Mở app lần đầu / đã đăng xuất từ trước: không có "lý do" để màn login hiện.
    useAuthStore.setState({ user: null, status: 'unauthenticated' })
    return
  }
  const epoch = getSessionEpoch()
  try {
    // `http` không có timeout mặc định (Android OkHttp cũng 0): mạng treo thì splash treo mãi.
    // Hết giờ = AxiosError không response → coi là lỗi tạm thời → offline.
    const user = await fetchProfile({ timeout: REFRESH_TIMEOUT_MS })
    if (getSessionEpoch() === epoch) store.setUser(user)
  } catch (e) {
    if (getSessionEpoch() !== epoch || getTokens() === null) return // interceptor đã kết thúc phiên (401/refresh hỏng)
    if (isTemporary(e)) {
      store.markOffline()
    } else {
      // Lỗi cứng mà interceptor không xử lý (interceptor chỉ lo 401), vd 403 tài khoản bị khoá.
      store.endSession(isApiError(e) && e.code === 100002 ? 'userInactive' : 'unauthorized')
    }
  }
}
