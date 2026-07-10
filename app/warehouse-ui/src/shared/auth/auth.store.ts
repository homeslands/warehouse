import { create } from 'zustand'
import { setAuthTokenGetter } from '@/shared/api/http'
import type { CurrentUser } from './permissions'

export const TOKEN_STORAGE_KEY = 'warehouse.accessToken'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

type AuthState = {
  token: string | null
  user: CurrentUser | null
  status: AuthStatus
  setToken: (token: string) => void
  setUser: (user: CurrentUser) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  user: null,
  status: 'loading',

  setToken: (token) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    set({ token })
  },

  setUser: (user) => set({ user, status: 'authenticated' }),

  logout: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    set({ token: null, user: null, status: 'unauthenticated' })
  },
}))

// Tiêm token vào http.ts mà không tạo vòng import ngược.
// KHÔNG lưu refreshToken: backend phát ra nó nhưng không endpoint nào tiêu thụ.
setAuthTokenGetter(() => useAuthStore.getState().token)
