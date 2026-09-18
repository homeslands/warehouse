import { useEffect } from 'react'
import { getData } from '@/shared/api/http'
import { ME_PATH } from '@/shared/api/routes'
import { useAuthStore } from './auth.store'
import type { CurrentUser } from './permissions'

/**
 * Xác minh phiên với backend mỗi khi một phiên bắt đầu (lúc boot, đăng nhập, tab khác đăng nhập).
 * 401 được interceptor tự refresh; refresh hỏng thì interceptor đã kết thúc phiên.
 */
export function useSession(): void {
  const hasSession = useAuthStore((s) => s.hasSession)
  const sessionEpoch = useAuthStore((s) => s.sessionEpoch)

  useEffect(() => {
    const { setUser, markUnavailable } = useAuthStore.getState()

    if (!hasSession) {
      if (useAuthStore.getState().status === 'loading') markUnavailable()
      return
    }

    let cancelled = false

    getData<CurrentUser>(ME_PATH)
      .then((user) => {
        if (!cancelled) setUser(user)
      })
      .catch(() => {
        // Còn phiên nghĩa là lỗi không phải do xác thực (mạng, 5xx): giữ token, F5 khi có mạng là vào lại.
        if (!cancelled && useAuthStore.getState().hasSession) markUnavailable()
      })

    return () => {
      cancelled = true
    }
  }, [hasSession, sessionEpoch])
}
