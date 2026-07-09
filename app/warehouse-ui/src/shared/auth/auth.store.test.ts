import { beforeEach, describe, expect, it } from 'vitest'
import { TOKEN_STORAGE_KEY, useAuthStore } from '@/shared/auth/auth.store'

const reset = () => {
  localStorage.clear()
  useAuthStore.setState({ token: null, user: null, status: 'loading' })
}

describe('useAuthStore', () => {
  beforeEach(reset)

  it('setToken ghi vào localStorage', () => {
    useAuthStore.getState().setToken('tok-1')
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('tok-1')
    expect(useAuthStore.getState().token).toBe('tok-1')
  })

  it('setUser chuyển status sang authenticated', () => {
    useAuthStore.getState().setUser({
      userId: 'u1',
      userName: 'root',
      roleName: 'SUPER_ADMIN',
      scope: '[]',
    })
    expect(useAuthStore.getState().status).toBe('authenticated')
  })

  it('logout xoá token khỏi localStorage và đặt status unauthenticated', () => {
    useAuthStore.getState().setToken('tok-1')
    useAuthStore.getState().logout()

    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })
})
