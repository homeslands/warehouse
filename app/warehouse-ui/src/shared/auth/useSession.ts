import { useEffect } from 'react'
import { getData } from '@/shared/api/http'
import { useAuthStore } from './auth.store'
import type { CurrentUser } from './permissions'

/**
 * Gọi một lần lúc boot. Có token trong localStorage thì hỏi backend xem nó còn sống không.
 * Đây cũng là cách phát hiện token hết hạn mà không cần tự decode `exp` ở client.
 */
export function useSession(): void {
  const token = useAuthStore((s) => s.token)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    if (!token) {
      useAuthStore.setState({ status: 'unauthenticated' })
      return
    }

    let cancelled = false

    getData<CurrentUser>('/auth/me')
      .then((user) => {
        if (!cancelled) setUser(user)
      })
      .catch(() => {
        if (!cancelled) logout()
      })

    return () => {
      cancelled = true
    }
  }, [token, setUser, logout])
}
