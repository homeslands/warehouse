/* eslint-disable @typescript-eslint/no-require-imports */
// Mỗi test nạp lại module: `token-storage` nhớ cờ `touched` (đã ghi/xoá thì hydrate không ghi đè),
// nên muốn thử hydrate THẬT từ SecureStore thì phải bắt đầu từ module sạch.
let fake: typeof import('@/shared/api/testing/fake-api')
let storage: typeof import('@/shared/api/token-storage')
let useAuthStore: typeof import('./auth.store').useAuthStore
let bootstrapSession: typeof import('./bootstrap').bootstrapSession
let getSecure: jest.Mock
let statuses: string[]
let unsubscribe: () => void

beforeEach(() => {
  jest.resetModules()
  fake = require('@/shared/api/testing/fake-api')
  storage = require('@/shared/api/token-storage')
  const api = require('@/shared/api/http') as typeof import('@/shared/api/http')
  ;({ useAuthStore } = require('./auth.store') as typeof import('./auth.store'))
  ;({ bootstrapSession } = require('./bootstrap') as typeof import('./bootstrap'))
  getSecure = require('expo-secure-store').getItemAsync as jest.Mock
  getSecure.mockReset().mockResolvedValue(null)
  // Task 8 nối thật; ở đây tái hiện đúng hợp đồng: handler gọi endSession (xoá token đồng bộ).
  api.setSessionEndHandler((reason) => useAuthStore.getState().endSession(reason))
  statuses = [useAuthStore.getState().status]
  unsubscribe = useAuthStore.subscribe((s) => {
    if (statuses[statuses.length - 1] !== s.status) statuses.push(s.status)
  })
})
/* eslint-enable @typescript-eslint/no-require-imports */

afterEach(() => unsubscribe())

const stored = JSON.stringify({ accessToken: 'acc-1', refreshToken: 'ref-1' })

describe('bootstrapSession', () => {
  it('không có token → unauthenticated, không gọi /auth/me', async () => {
    await bootstrapSession()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(fake.callsTo('get', '/auth/me')).toHaveLength(0)
  })

  it('đọc token từ SecureStore (hydrate) TRƯỚC khi gọi /auth/me', async () => {
    getSecure.mockResolvedValue(stored)
    fake.route('get', '/auth/me', () => fake.ok(fake.profile()))
    await bootstrapSession()
    expect(fake.callsTo('get', '/auth/me')[0]?.auth).toBe('Bearer acc-1')
  })

  it('có token, /auth/me 200 → authenticated và giữ user.warehouses', async () => {
    getSecure.mockResolvedValue(stored)
    fake.route('get', '/auth/me', () => fake.ok(fake.profile()))
    await bootstrapSession()
    const { status, user } = useAuthStore.getState()
    expect(status).toBe('authenticated')
    expect(user?.warehouses).toEqual([
      { slug: 'wh-1', code: 'WH1', name: 'Kho 1', isManager: true },
    ])
  })

  it('access hết hạn: 401 → refresh 200 → gửi lại 200; status không bao giờ qua unauthenticated', async () => {
    getSecure.mockResolvedValue(stored)
    let n = 0
    fake.route('get', '/auth/me', () =>
      ++n === 1 ? fake.failure(401, 100003) : fake.ok(fake.profile()),
    )
    fake.route('post', '/auth/refresh', () => fake.refreshed('acc-2'))
    await bootstrapSession()
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(fake.callsTo('get', '/auth/me')).toHaveLength(2)
    expect(fake.callsTo('get', '/auth/me')[1]?.auth).toBe('Bearer acc-2')
    expect(statuses).not.toContain('unauthenticated')
    expect(statuses).toEqual(['loading', 'authenticated'])
  })

  it('refresh bị từ chối → interceptor kết thúc phiên (unauthenticated, token bị xoá)', async () => {
    getSecure.mockResolvedValue(stored)
    fake.route('get', '/auth/me', () => fake.failure(401, 100003))
    fake.route('post', '/auth/refresh', () => fake.failure(401, 100004))
    await bootstrapSession()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(useAuthStore.getState().endReason).toBe('expired')
    expect(storage.getTokens()).toBeNull()
  })

  it.each([
    ['lỗi mạng', 'network' as 'network' | number],
    ['5xx', 503],
    ['408', 408],
    ['429', 429],
  ])('%s → offline và GIỮ token', async (_name, reply) => {
    getSecure.mockResolvedValue(stored)
    fake.route('get', '/auth/me', () => (reply === 'network' ? reply : fake.failure(reply)))
    await bootstrapSession()
    expect(useAuthStore.getState().status).toBe('offline')
    expect(storage.getTokens()).not.toBeNull()
  })

  it('/auth/me 403 userInactive (interceptor không xử lý 403) → kết thúc phiên', async () => {
    getSecure.mockResolvedValue(stored)
    fake.route('get', '/auth/me', () => fake.failure(403, 100002))
    await bootstrapSession()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(useAuthStore.getState().endReason).toBe('userInactive')
    expect(storage.getTokens()).toBeNull()
  })

  it('phiên đã bị kết thúc trong lúc /auth/me bay → không "sống lại"', async () => {
    getSecure.mockResolvedValue(stored)
    fake.route('get', '/auth/me', async () => {
      useAuthStore.getState().endSession('loggedOut')
      return fake.ok(fake.profile())
    })
    await bootstrapSession()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('token đã có sẵn trong bộ nhớ vẫn được dùng', async () => {
    storage.setTokens({ accessToken: 'mem', refreshToken: 'ref-1' })
    fake.route('get', '/auth/me', () => fake.ok(fake.profile()))
    await bootstrapSession()
    expect(useAuthStore.getState().status).toBe('authenticated')
  })

  it('/auth/me treo (mạng chập chờn) → hết REFRESH_TIMEOUT_MS thì offline, giữ token', async () => {
    jest.useFakeTimers()
    try {
      getSecure.mockResolvedValue(stored)
      fake.route('get', '/auth/me', () => 'hang')
      const { REFRESH_TIMEOUT_MS } =
        require('@/shared/api/http') as typeof import('@/shared/api/http') // eslint-disable-line @typescript-eslint/no-require-imports
      const done = bootstrapSession()
      await jest.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS - 1)
      expect(useAuthStore.getState().status).toBe('loading')
      await jest.advanceTimersByTimeAsync(1)
      await done
      expect(useAuthStore.getState().status).toBe('offline')
      expect(storage.getTokens()).not.toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it('phiên đổi trong lúc /auth/me bay (endSession → startSession) → hồ sơ cũ bị bỏ', async () => {
    getSecure.mockResolvedValue(stored)
    fake.route('get', '/auth/me', async () => {
      useAuthStore.getState().endSession('loggedOut')
      useAuthStore.getState().startSession({ accessToken: 'b', refreshToken: 'b' })
      return fake.ok(fake.profile({ userName: 'A' }))
    })
    await bootstrapSession()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().status).toBe('loading')
  })
})
