import { getData } from '@/shared/api/http'
import { ME_PATH } from '@/shared/api/routes'
import { useAuthStore } from './auth.store'
import type { CurrentUser } from './permissions'

/**
 * Nạp lại `/auth/me` vào store. Dùng sau khi người dùng tự đổi quyền của CHÍNH role mình: backend
 * đã đổi thật (và đã xoá cache Redis), còn `useAuthStore.user.scope` thì nạp một lần lúc mở phiên
 * và không tự mới lại — để nguyên thì mọi `can()` sau đó trả lời sai.
 *
 * Làm mới STORE chứ không phải cache react-query: `can()` đọc từ store.
 *
 * Cũng được gọi khi backend trả 403 do thiếu quyền (`app/query-client.ts`) — lúc đó nhiều request
 * có thể bị từ chối cùng lúc, nên các lời gọi chồng nhau dùng chung MỘT request `/auth/me`.
 */
let inFlight: Promise<void> | null = null

export function refreshCurrentUser(): Promise<void> {
  inFlight ??= getData<CurrentUser>(ME_PATH)
    .then((user) => useAuthStore.getState().setUser(user))
    .finally(() => {
      inFlight = null
    })
  return inFlight
}
