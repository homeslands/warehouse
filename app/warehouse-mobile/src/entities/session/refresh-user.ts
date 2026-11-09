import { getSessionEpoch, useAuthStore } from './auth.store'
import { fetchProfile } from './session.api'

let inFlight: { epoch: number; promise: Promise<void> } | null = null

/**
 * Nạp lại `/auth/me` vào store (`can()` đọc từ store, không từ cache react-query). Các lời gọi
 * chồng nhau CỦA CÙNG MỘT PHIÊN dùng chung một request; kết quả về sau khi phiên đã đổi bị bỏ.
 * Lỗi được ném cho nơi gọi quyết định.
 */
export function refreshCurrentUser(): Promise<void> {
  const epoch = getSessionEpoch()
  if (inFlight?.epoch === epoch) return inFlight.promise
  const promise = fetchProfile()
    .then((user) => {
      if (getSessionEpoch() === epoch) useAuthStore.getState().setUser(user)
    })
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null
    })
  inFlight = { epoch, promise }
  return promise
}
