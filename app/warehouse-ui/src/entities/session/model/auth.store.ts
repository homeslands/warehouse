import { create } from 'zustand'
import { http } from '@/shared/api/http'
import { LOGOUT_PATH } from '@/shared/api/routes'
import {
  clearTokens,
  getTokens,
  setTokens,
  subscribe,
  type TokenPair,
} from '@/shared/api/token-storage'
import type { SessionEndReason } from '@/shared/api/types'
import type { CurrentUser } from './permissions'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

/** Chờ API thu hồi phiên tối đa bấy nhiêu trước khi đăng xuất ở client. */
export const LOGOUT_TIMEOUT_MS = 5000

type AuthState = {
  /** Có token trong storage. KHÔNG giữ chuỗi access token: refresh đổi nó mỗi ~15 phút. */
  hasSession: boolean
  /** Tăng mỗi khi một phiên mới bắt đầu, để useSession tải lại /auth/me kể cả khi hasSession vẫn true. */
  sessionEpoch: number
  user: CurrentUser | null
  status: AuthStatus
  endReason: SessionEndReason | null
  setUser: (user: CurrentUser) => void
  /** Không xác minh được phiên (lỗi mạng) — giữ token, coi như chưa vào được. */
  markUnavailable: () => void
  startSession: (pair: TokenPair) => void
  endSession: (reason: SessionEndReason) => void
  /** Chỉ thay token (đổi mật khẩu). Không xoá cache, không đổi user. */
  replaceTokens: (pair: TokenPair) => void
  logout: () => Promise<void>
}

let clearCache: () => void = () => {}

/**
 * Tiêm hàm dọn cache từ tầng `app` vào. Cùng pattern với setSessionEndHandler trong
 * shared/api/http.ts: entity không được import app, nên app tự đưa khả năng của mình xuống.
 */
export function setCacheCleaner(fn: () => void): void {
  clearCache = fn
}

export const useAuthStore = create<AuthState>((set, get) => ({
  hasSession: getTokens() !== null,
  sessionEpoch: 0,
  user: null,
  status: 'loading',
  endReason: null,

  setUser: (user) => set({ user, status: 'authenticated' }),

  markUnavailable: () => set({ status: 'unauthenticated' }),

  // THỨ TỰ QUAN TRỌNG ở startSession/endSession: đổi state TRƯỚC, ghi storage SAU. Listener
  // subscribe() ở cuối file chạy đồng bộ ngay trong setTokens/clearTokens; nó phải thấy state đã
  // đổi để biết đây là thay đổi của chính tab này, không phải từ tab khác.
  startSession: (pair) => {
    set((s) => ({
      hasSession: true,
      sessionEpoch: s.sessionEpoch + 1,
      user: null,
      status: 'loading',
      endReason: null,
    }))
    // Phiên mới luôn bắt đầu với cache rỗng (xem Task 16).
    clearCache()
    // setTokens ném (storage bị chặn) thì state đã báo có phiên mà không có token: useSession gọi
    // /auth/me không token → lỗi → markUnavailable (unauthenticated).
    setTokens(pair)
  },

  endSession: (reason) => {
    set({ hasSession: false, user: null, status: 'unauthenticated', endReason: reason })
    clearCache()
    clearTokens()
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
}))

// Đồng bộ với tab khác. Thay đổi do chính tab này tạo ra đã được phản ánh vào state trước khi tới
// đây (xem thứ tự ở trên) nên rơi vào nhánh không làm gì.
subscribe((pair) => {
  const state = useAuthStore.getState()
  if (pair === null && state.hasSession) {
    // Không biết lý do thật ở tab kia → không hiện thông báo, không nhớ trang để quay lại.
    useAuthStore.setState({
      hasSession: false,
      user: null,
      status: 'unauthenticated',
      endReason: 'loggedOut',
    })
    clearCache()
  } else if (pair !== null && !state.hasSession) {
    useAuthStore.setState((s) => ({
      hasSession: true,
      sessionEpoch: s.sessionEpoch + 1,
      status: 'loading',
      endReason: null,
    }))
  }
})
