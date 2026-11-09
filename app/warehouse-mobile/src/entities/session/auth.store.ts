import { create } from 'zustand'
import { http } from '@/shared/api/http'
import { LOGOUT_ALL_PATH, LOGOUT_PATH } from '@/shared/api/routes'
import { clearTokens, getTokens, setTokens, type TokenPair } from '@/shared/api/token-storage'
import type { SessionEndReason } from '@/shared/api/types'
import type { CurrentUser } from './permissions'

/**
 * `loading`: chưa biết (đang khởi động / đang nạp hồ sơ sau đăng nhập). `offline`: có token nhưng
 * chưa xác minh được vì lỗi tạm thời — token được GIỮ.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'offline'

/** Chờ API thu hồi phiên tối đa bấy nhiêu trước khi đăng xuất ở client. */
export const LOGOUT_TIMEOUT_MS = 5000

type AuthState = {
  user: CurrentUser | null
  status: AuthStatus
  endReason: SessionEndReason | null
  /** Bị bỏ qua khi phiên đã kết thúc: một `/auth/me` về muộn không được làm phiên "sống lại". */
  setUser: (user: CurrentUser) => void
  /** Không xác minh được phiên (lỗi tạm thời) — giữ token, chưa vào được. */
  markOffline: () => void
  startSession: (pair: TokenPair) => void
  /** Xoá token ĐỒNG BỘ, chạy cache cleaner + listener. Không đụng dữ liệu nháp trên máy. */
  endSession: (reason: SessionEndReason) => void
  /** Chỉ thay token (đổi mật khẩu). Không xoá cache, không đổi user. */
  replaceTokens: (pair: TokenPair) => void
  logout: () => Promise<void>
  /** Thu hồi mọi thiết bị. Lỗi thì ném ra và GIỮ phiên — nơi gọi (`useGuardedAction`) báo lỗi. */
  logoutAll: () => Promise<void>
  /** Đăng ký việc dọn dẹp khi phiên kết thúc (vd reset store kho). Trả hàm huỷ đăng ký. */
  onSessionEnd: (listener: (reason: SessionEndReason) => void) => () => void
}

/**
 * Đếm phiên: tăng ở startSession và endSession. Request hồ sơ chụp số này TRƯỚC khi gửi và bỏ kết
 * quả nếu nó đã đổi — hồ sơ của phiên cũ không được ghi vào phiên mới.
 */
let sessionEpoch = 0
export const getSessionEpoch = (): number => sessionEpoch

let clearCache: () => void = () => {}
const endListeners = new Set<(reason: SessionEndReason) => void>()

/**
 * Tiêm hàm dọn cache react-query từ tầng `bootstrap` vào. Entity không được import tầng trên, nên
 * tầng trên tự đưa khả năng của mình xuống.
 */
export function setCacheCleaner(fn: () => void): void {
  clearCache = fn
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',
  endReason: null,

  setUser: (user) => {
    if (get().status === 'unauthenticated') return
    set({ user, status: 'authenticated' })
  },

  markOffline: () => {
    if (get().status === 'unauthenticated') return
    set({ status: 'offline' })
  },

  // THỨ TỰ QUAN TRỌNG ở startSession/endSession: đổi state TRƯỚC, ghi storage SAU. Subscriber của
  // token-storage chạy đồng bộ ngay trong setTokens/clearTokens; nó phải thấy state đã đổi.
  startSession: (pair) => {
    sessionEpoch++
    set({ user: null, status: 'loading', endReason: null })
    // Phiên mới luôn bắt đầu với cache rỗng.
    clearCache()
    setTokens(pair)
  },

  endSession: (reason) => {
    sessionEpoch++
    set({ user: null, status: 'unauthenticated', endReason: reason })
    // ĐỒNG BỘ: interceptor của http.ts chỉ gọi handler khi còn token, nhờ đó N request lỗi cùng lúc
    // chỉ kết thúc phiên đúng một lần.
    clearTokens()
    clearCache()
    // Chỉ token + user + cache: dữ liệu nháp (kv) ở lại máy để người dùng quay lại làm tiếp.
    endListeners.forEach((listener) => {
      try {
        listener(reason)
      } catch (e) {
        console.warn('[auth.store] Listener onSessionEnd ném lỗi', e)
      }
    })
  },

  replaceTokens: (pair) => setTokens(pair),

  logout: async () => {
    if (getTokens()) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, LOGOUT_TIMEOUT_MS)
      })
      try {
        // Thu hồi phiên trên server. Lỗi hay chậm cũng không được chặn việc đăng xuất ở client.
        await Promise.race([http.post(LOGOUT_PATH), timeout])
      } catch {
        // bỏ qua
      } finally {
        clearTimeout(timer)
      }
    }
    get().endSession('loggedOut')
  },

  logoutAll: async () => {
    await http.post(LOGOUT_ALL_PATH)
    get().endSession('loggedOut')
  },

  onSessionEnd: (listener) => {
    endListeners.add(listener)
    return () => {
      endListeners.delete(listener)
    }
  },
}))
