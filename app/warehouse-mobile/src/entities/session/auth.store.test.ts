import { callsTo, failure, ok, profile, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { clearTokens, getTokens, setTokens, subscribe } from '@/shared/api/token-storage'
import { kv } from '@/shared/storage/kv'
import { refreshCurrentUser } from './refresh-user'
import { LOGOUT_TIMEOUT_MS, setCacheCleaner, useAuthStore } from './auth.store'
import type { CurrentUser } from './permissions'

const pair = { accessToken: 'acc-1', refreshToken: 'ref-1' }
const user = profile() as unknown as CurrentUser
let cleaner: jest.Mock

beforeEach(() => {
  resetFakeApi()
  clearTokens()
  cleaner = jest.fn()
  setCacheCleaner(cleaner)
  useAuthStore.setState({ status: 'loading', user: null, endReason: null })
})

describe('endSession', () => {
  it('xoá token ĐỒNG BỘ (http.ts dựa vào đó để chỉ báo một lần mỗi phiên)', () => {
    setTokens(pair)
    useAuthStore.getState().endSession('expired')
    expect(getTokens()).toBeNull()
  })

  it('đổi state, xoá user, ghi lý do, gọi cache cleaner đúng 1 lần', () => {
    setTokens(pair)
    useAuthStore.setState({ status: 'authenticated', user })
    useAuthStore.getState().endSession('revoked')
    const s = useAuthStore.getState()
    expect([s.status, s.user, s.endReason]).toEqual(['unauthenticated', null, 'revoked'])
    expect(cleaner).toHaveBeenCalledTimes(1)
  })

  it('chạy listener onSessionEnd SAU khi token đã bị xoá; hủy đăng ký thì không chạy nữa', () => {
    setTokens(pair)
    const seen: unknown[] = []
    const off = useAuthStore.getState().onSessionEnd((reason) => seen.push([reason, getTokens()]))
    useAuthStore.getState().endSession('expired')
    expect(seen).toEqual([['expired', null]])
    off()
    useAuthStore.getState().endSession('expired')
    expect(seen).toHaveLength(1)
  })

  it('listener ném lỗi không chặn listener sau và không làm endSession ném', () => {
    const second = jest.fn()
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const off1 = useAuthStore.getState().onSessionEnd(() => {
      throw new Error('boom')
    })
    const off2 = useAuthStore.getState().onSessionEnd(second)
    expect(() => useAuthStore.getState().endSession('expired')).not.toThrow()
    expect(second).toHaveBeenCalledWith('expired')
    off1()
    off2()
    warn.mockRestore()
  })

  it('KHÔNG xoá dữ liệu nháp khác trên máy (kv), chỉ token + user + cache', async () => {
    await kv.set('draft.import', 'nháp')
    setTokens(pair)
    useAuthStore.getState().endSession('loggedOut')
    await expect(kv.get('draft.import')).resolves.toBe('nháp')
  })
})

describe('startSession / setUser / markOffline / replaceTokens', () => {
  it('startSession: lưu token, status loading, xoá user + lý do cũ, dọn cache', () => {
    useAuthStore.setState({ status: 'unauthenticated', user, endReason: 'expired' })
    useAuthStore.getState().startSession(pair)
    const s = useAuthStore.getState()
    expect([s.status, s.user, s.endReason]).toEqual(['loading', null, null])
    expect(getTokens()).toEqual(pair)
    expect(cleaner).toHaveBeenCalledTimes(1)
  })

  it('startSession đổi state TRƯỚC khi ghi token (subscriber token thấy state mới)', () => {
    let seen: string | undefined
    useAuthStore.setState({ status: 'unauthenticated' })
    const off = subscribe(() => {
      seen = useAuthStore.getState().status
    })
    useAuthStore.getState().startSession(pair)
    off()
    expect(seen).toBe('loading')
  })

  it('setUser → authenticated; bị bỏ qua nếu phiên đã kết thúc', () => {
    useAuthStore.getState().setUser(user)
    expect(useAuthStore.getState().status).toBe('authenticated')
    useAuthStore.getState().endSession('expired')
    useAuthStore.getState().setUser(user)
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('markOffline giữ token', () => {
    setTokens(pair)
    useAuthStore.getState().markOffline()
    expect(useAuthStore.getState().status).toBe('offline')
    expect(getTokens()).not.toBeNull()
  })

  it('replaceTokens chỉ đổi token: không đổi user, không dọn cache', () => {
    useAuthStore.setState({ status: 'authenticated', user })
    useAuthStore.getState().replaceTokens(pair)
    expect(getTokens()).toEqual(pair)
    expect(useAuthStore.getState().user).toBe(user)
    expect(cleaner).not.toHaveBeenCalled()
  })
})

describe('logout', () => {
  afterEach(() => jest.useRealTimers())

  it('gọi /auth/logout rồi endSession("loggedOut")', async () => {
    setTokens(pair)
    route('post', '/auth/logout', () => ok())
    await useAuthStore.getState().logout()
    expect(callsTo('post', '/auth/logout')).toHaveLength(1)
    expect(useAuthStore.getState().endReason).toBe('loggedOut')
    expect(getTokens()).toBeNull()
  })

  it('/auth/logout treo quá 5s vẫn endSession("loggedOut")', async () => {
    jest.useFakeTimers()
    setTokens(pair)
    route('post', '/auth/logout', () => 'hang')
    const done = useAuthStore.getState().logout()
    await jest.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS - 1)
    expect(getTokens()).not.toBeNull()
    await jest.advanceTimersByTimeAsync(1)
    await done
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(useAuthStore.getState().endReason).toBe('loggedOut')
    expect(getTokens()).toBeNull()
    expect(cleaner).toHaveBeenCalledTimes(1)
  })

  it('/auth/logout lỗi vẫn đăng xuất ở client', async () => {
    setTokens(pair)
    route('post', '/auth/logout', () => failure(500))
    await useAuthStore.getState().logout()
    expect(useAuthStore.getState().endReason).toBe('loggedOut')
  })
})

describe('logoutAll', () => {
  it('thành công → endSession("loggedOut")', async () => {
    setTokens(pair)
    route('post', '/auth/logout-all', () => ok())
    await useAuthStore.getState().logoutAll()
    expect(getTokens()).toBeNull()
    expect(useAuthStore.getState().endReason).toBe('loggedOut')
  })

  it('thất bại → ném lỗi và GIỮ phiên (để nơi gọi báo lỗi, người dùng thử lại)', async () => {
    setTokens(pair)
    useAuthStore.setState({ status: 'authenticated', user })
    route('post', '/auth/logout-all', () => failure(500))
    await expect(useAuthStore.getState().logoutAll()).rejects.toMatchObject({ statusCode: 500 })
    expect(getTokens()).not.toBeNull()
    expect(useAuthStore.getState().status).toBe('authenticated')
  })
})

describe('hồ sơ của phiên cũ không ghi vào phiên mới', () => {
  it('refreshCurrentUser bay → endSession → startSession → reply về: user vẫn null, status loading', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    setTokens(pair)
    useAuthStore.setState({ status: 'authenticated', user })
    route('get', '/auth/me', async () => {
      await gate
      return ok(profile({ userName: 'A' }))
    })
    const pending = refreshCurrentUser()
    useAuthStore.getState().endSession('loggedOut')
    useAuthStore.getState().startSession({ accessToken: 'b', refreshToken: 'b' })
    release()
    await pending
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().status).toBe('loading')
  })

  it('không dùng chung request đang bay của phiên cũ cho phiên mới', async () => {
    let n = 0
    const gates: (() => void)[] = []
    setTokens(pair)
    route('get', '/auth/me', async () => {
      const i = n++
      await new Promise<void>((r) => gates.push(() => r()))
      return ok(profile({ userName: i === 0 ? 'A' : 'B' }))
    })
    const a = refreshCurrentUser()
    useAuthStore.getState().endSession('loggedOut')
    useAuthStore.getState().startSession({ accessToken: 'b', refreshToken: 'b' })
    const b = refreshCurrentUser()
    await Promise.resolve()
    await new Promise<void>((r) => setImmediate(() => r()))
    gates.forEach((g) => g())
    await Promise.all([a, b])
    expect(callsTo('get', '/auth/me')).toHaveLength(2)
    expect(useAuthStore.getState().user?.userName).toBe('B')
  })
})
