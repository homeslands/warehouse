import { HttpResponse, http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/shared/test/msw'
import { http } from '@/shared/api/http'
import { getTokens, setTokens } from '@/shared/api/token-storage'
import { LOGOUT_TIMEOUT_MS, setCacheCleaner, useAuthStore } from './auth.store'

const BASE = 'http://localhost:8085/api/v1'
const pair = { accessToken: 'acc-1', refreshToken: 'ref-1' }
const user = { userId: 'u1', userName: 'root', roleName: 'SUPER_ADMIN', scope: '[]' }

let cleaner: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  cleaner = vi.fn<() => void>()
  setCacheCleaner(cleaner)
  useAuthStore.setState({
    hasSession: false,
    sessionEpoch: 0,
    user: null,
    status: 'loading',
    endReason: null,
  })
})

afterEach(() => {
  setCacheCleaner(() => {})
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('startSession', () => {
  it('lưu token, xoá cache, chuyển loading, tăng sessionEpoch, xoá endReason cũ', () => {
    useAuthStore.setState({ endReason: 'expired' })
    useAuthStore.getState().startSession(pair)

    const s = useAuthStore.getState()
    expect(getTokens()).toEqual(pair)
    expect(cleaner).toHaveBeenCalledOnce()
    expect(s.hasSession).toBe(true)
    expect(s.status).toBe('loading')
    expect(s.sessionEpoch).toBe(1)
    expect(s.endReason).toBeNull()
  })
})

describe('endSession', () => {
  it('xoá token, xoá cache, unauthenticated, ghi lý do', () => {
    useAuthStore.getState().startSession(pair)
    useAuthStore.getState().setUser(user)
    cleaner.mockClear()

    useAuthStore.getState().endSession('revoked')

    const s = useAuthStore.getState()
    expect(getTokens()).toBeNull()
    expect(cleaner).toHaveBeenCalledOnce()
    expect(s).toMatchObject({
      hasSession: false,
      user: null,
      status: 'unauthenticated',
      endReason: 'revoked',
    })
  })
})

describe('replaceTokens', () => {
  it('chỉ thay token — KHÔNG xoá cache, không đổi user/status', () => {
    useAuthStore.getState().startSession(pair)
    useAuthStore.getState().setUser(user)
    cleaner.mockClear()

    useAuthStore.getState().replaceTokens({ accessToken: 'acc-2', refreshToken: 'ref-2' })

    expect(getTokens()).toEqual({ accessToken: 'acc-2', refreshToken: 'ref-2' })
    expect(cleaner).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      user,
      status: 'authenticated',
      hasSession: true,
    })
  })
})

describe('logout', () => {
  it('gọi POST /auth/logout với token hiện có rồi kết thúc phiên (loggedOut)', async () => {
    useAuthStore.getState().startSession(pair)
    let seenAuth: string | null = null
    server.use(
      mswHttp.post(`${BASE}/auth/logout`, ({ request }) => {
        seenAuth = request.headers.get('authorization')
        return HttpResponse.json({
          message: 'ok',
          statusCode: 200,
          timestamp: '',
          result: { revokedSessions: 1 },
        })
      }),
    )

    await useAuthStore.getState().logout()

    expect(seenAuth).toBe('Bearer acc-1')
    expect(getTokens()).toBeNull()
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated',
      endReason: 'loggedOut',
    })
  })

  it('access token đã hết hạn → logout 401 → refresh → gửi lại logout bằng token mới', async () => {
    useAuthStore.getState().startSession(pair)
    const logoutAuths: (string | null)[] = []
    server.use(
      mswHttp.post(`${BASE}/auth/logout`, ({ request }) => {
        const auth = request.headers.get('authorization')
        logoutAuths.push(auth)
        return auth === 'Bearer acc-2'
          ? HttpResponse.json({
              message: 'ok',
              statusCode: 200,
              timestamp: '',
              result: { revokedSessions: 1 },
            })
          : HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 })
      }),
      mswHttp.post(`${BASE}/auth/refresh`, () =>
        HttpResponse.json({
          message: 'ok',
          statusCode: 200,
          timestamp: '',
          result: { accessToken: 'acc-2', refreshToken: 'ref-2' },
        }),
      ),
    )

    await useAuthStore.getState().logout()

    // Server nhận lần gửi lại → phiên (sid) thật sự bị thu hồi.
    expect(logoutAuths).toEqual(['Bearer acc-1', 'Bearer acc-2'])
    expect(getTokens()).toBeNull()
    expect(useAuthStore.getState().endReason).toBe('loggedOut')
  })

  it('API logout lỗi → vẫn kết thúc phiên ở client', async () => {
    useAuthStore.getState().startSession(pair)
    server.use(mswHttp.post(`${BASE}/auth/logout`, () => HttpResponse.error()))

    await useAuthStore.getState().logout()

    expect(getTokens()).toBeNull()
    expect(useAuthStore.getState().endReason).toBe('loggedOut')
  })

  it(`API logout treo quá ${LOGOUT_TIMEOUT_MS}ms → vẫn kết thúc phiên`, async () => {
    useAuthStore.getState().startSession(pair)
    vi.useFakeTimers()
    vi.spyOn(http, 'post').mockReturnValue(new Promise(() => {}))

    const done = useAuthStore.getState().logout()
    await vi.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS)
    await done

    expect(getTokens()).toBeNull()
    expect(useAuthStore.getState().endReason).toBe('loggedOut')
  })

  it('không có token → không gọi API, vẫn kết thúc phiên', async () => {
    const post = vi.spyOn(http, 'post')
    await useAuthStore.getState().logout()
    expect(post).not.toHaveBeenCalled()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })
})

describe('đồng bộ tab (sự kiện storage)', () => {
  it('tab khác xoá token → tab này kết thúc phiên (loggedOut) và xoá cache', () => {
    useAuthStore.getState().startSession(pair)
    useAuthStore.getState().setUser(user)
    cleaner.mockClear()

    localStorage.removeItem('warehouse.auth')
    window.dispatchEvent(new StorageEvent('storage', { key: 'warehouse.auth' }))

    expect(useAuthStore.getState()).toMatchObject({
      hasSession: false,
      status: 'unauthenticated',
      endReason: 'loggedOut',
    })
    expect(cleaner).toHaveBeenCalledOnce()
  })

  it('tab khác đăng nhập → tab này có phiên, loading, tăng sessionEpoch', () => {
    localStorage.setItem('warehouse.auth', JSON.stringify(pair))
    window.dispatchEvent(new StorageEvent('storage', { key: 'warehouse.auth' }))

    expect(useAuthStore.getState()).toMatchObject({
      hasSession: true,
      status: 'loading',
      sessionEpoch: 1,
    })
  })

  it('refresh trong cùng tab (setTokens khi đang có phiên) → không đổi state, không xoá cache', () => {
    useAuthStore.getState().startSession(pair)
    const before = useAuthStore.getState().sessionEpoch
    cleaner.mockClear()

    setTokens({ accessToken: 'acc-refreshed', refreshToken: 'ref-1' })

    expect(useAuthStore.getState().sessionEpoch).toBe(before)
    expect(cleaner).not.toHaveBeenCalled()
  })
})

describe('refresh đang bay lúc đăng xuất', () => {
  it('refresh trả về sau endSession → không đăng nhập lại', async () => {
    useAuthStore.getState().startSession(pair)
    let refreshStarted!: () => void
    const started = new Promise<void>((resolve) => (refreshStarted = resolve))
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    server.use(
      mswHttp.get(`${BASE}/examples`, () =>
        HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      ),
      mswHttp.post(`${BASE}/auth/refresh`, async () => {
        refreshStarted()
        await released
        return HttpResponse.json({
          message: 'ok',
          statusCode: 200,
          timestamp: '',
          result: { accessToken: 'acc-2', refreshToken: 'ref-2' },
        })
      }),
    )

    const pending = http.get('/examples')
    await started
    useAuthStore.getState().endSession('loggedOut')
    release()
    await expect(pending).rejects.toBeTruthy()

    expect(getTokens()).toBeNull()
    expect(useAuthStore.getState()).toMatchObject({
      hasSession: false,
      status: 'unauthenticated',
      endReason: 'loggedOut',
    })
  })
})
