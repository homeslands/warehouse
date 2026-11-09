import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useAuthStore } from './auth.store'
import { refreshCurrentUser } from './refresh-user'

/** Hai lần nạp lại cách nhau ít nhất chừng này (vuốt qua app khác rồi quay lại liên tục). */
export const MIN_REFRESH_INTERVAL_MS = 30_000

/**
 * Quay lại app (`AppState` → `active`) khi đã đăng nhập thì nạp lại hồ sơ để `scope` mới có hiệu
 * lực — quyền vừa được CẤP THÊM không sinh ra lỗi nào nên không có đường nào khác để biết.
 */
export function useRefreshProfileOnForeground(): void {
  useEffect(() => {
    let lastCheck = 0
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      if (useAuthStore.getState().status !== 'authenticated') return
      const now = Date.now()
      if (now - lastCheck < MIN_REFRESH_INTERVAL_MS) return
      lastCheck = now
      // Việc phụ: lỗi mạng thì lần quay lại sau thử tiếp; 401 do interceptor lo.
      refreshCurrentUser().catch(() => {})
    })
    return () => sub.remove()
  }, [])
}
