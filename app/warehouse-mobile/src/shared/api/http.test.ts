import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

import { installRnFormData } from './testing/rn-form-data'
import type { SessionEndReason } from './types'

/**
 * Không có msw ở mobile → thay adapter của axios bằng bộ định tuyến tự viết. `http` và
 * `refreshClient` được tạo bằng `axios.create()` nên thừa hưởng `axios.defaults.adapter` LÚC TẠO:
 * phải đặt adapter rồi mới import `./http` (xem `beforeAll`).
 */
type Reply = { status: number; data?: unknown } | 'network'
type Handler = (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>

const routes = new Map<string, Handler>()
const calls: { method: string; url: string; auth: string | undefined; body: unknown }[] = []

const route = (method: string, url: string, handler: Handler) =>
  routes.set(`${method} ${url}`, handler)

function headerOf(config: InternalAxiosRequestConfig, name: string): string | undefined {
  const v = config.headers.get(name)
  return typeof v === 'string' ? v : undefined
}

async function fakeAdapter(config: InternalAxiosRequestConfig) {
  const method = (config.method ?? 'get').toLowerCase()
  const url = config.url ?? ''
  const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
  calls.push({ method, url, auth: headerOf(config, 'Authorization'), body })

  const handler = routes.get(`${method} ${url}`)
  if (!handler) throw new Error(`Chưa khai route: ${method} ${url}`)
  const reply = await handler(config)
  if (reply === 'network') throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config)

  const response = { data: reply.data, status: reply.status, statusText: '', headers: {}, config }
  if (reply.status >= 200 && reply.status < 300) return response
  throw new AxiosError(
    `Request failed with status code ${reply.status}`,
    reply.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    response,
  )
}

const callsTo = (method: string, url: string) =>
  calls.filter((c) => c.method === method && c.url === url)

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const unauthorized = (path: string, code?: number): Reply => ({
  status: 401,
  data: {
    statusCode: 401,
    ...(code ? { code } : {}),
    timestamp: '',
    path,
    method: 'GET',
    message: 'Unauthorized',
  },
})

const errorBody = (status: number, code: number | undefined, path = '/auth/refresh'): Reply => ({
  status,
  data: {
    statusCode: status,
    ...(code ? { code } : {}),
    timestamp: '',
    path,
    method: 'POST',
    message: 'x',
  },
})

const ok = (result: unknown = {}): Reply => ({
  status: 200,
  data: { message: 'ok', statusCode: 200, timestamp: '', result },
})

const refreshed = (accessToken: string, refreshToken = 'ref-2'): Reply =>
  ok({ accessToken, refreshToken, expireTime: '', expireTimeRefreshToken: '' })

let api: typeof import('./http')
let errorMessage: typeof import('./error-message').errorMessage
let storage: typeof import('./token-storage')
let onSessionEnd: jest.Mock<void, [SessionEndReason]>

beforeAll(async () => {
  axios.defaults.adapter = fakeAdapter
  /* eslint-disable @typescript-eslint/no-require-imports */
  api = require('./http') as typeof import('./http')
  errorMessage = (require('./error-message') as typeof import('./error-message')).errorMessage
  storage = require('./token-storage') as typeof import('./token-storage')
  /* eslint-enable @typescript-eslint/no-require-imports */
})

beforeEach(() => {
  routes.clear()
  calls.length = 0
  storage.clearTokens()
  onSessionEnd = jest.fn()
  api.setSessionEndHandler(onSessionEnd)
})

const { setTokens, clearTokens, getTokens } = {
  setTokens: (p: { accessToken: string; refreshToken: string }) => storage.setTokens(p),
  clearTokens: () => storage.clearTokens(),
  getTokens: () => storage.getTokens(),
}

describe('getData', () => {
  it('bóc `result` ra khỏi envelope', async () => {
    route('get', '/examples/abc', () => ok({ id: '1', slug: 'abc', name: 'Example A' }))
    await expect(api.getData('/examples/abc')).resolves.toEqual({
      id: '1',
      slug: 'abc',
      name: 'Example A',
    })
  })

  it('gắn Bearer token đọc từ token-storage tại thời điểm gửi', async () => {
    setTokens({ accessToken: 'tok-123', refreshToken: 'ref-1' })
    route('get', '/auth/me', () => ok())
    await api.getData('/auth/me')
    expect(calls[0]?.auth).toBe('Bearer tok-123')
  })

  it('không gắn header Authorization khi chưa có token', async () => {
    route('get', '/auth/me', () => ok())
    await api.getData('/auth/me')
    expect(calls[0]?.auth).toBeUndefined()
  })
})

describe('getPaginated', () => {
  const page = (over: object = {}) =>
    ok({
      items: [{ slug: 'a' }],
      total: 12,
      page: 2,
      pageSize: 10,
      totalPages: 2,
      hasNext: false,
      hasPrevios: true,
      ...over,
    })

  it('gửi `size` lên nhưng đọc `pageSize` về, và đổi `hasPrevios` thành `hasPrevious`', async () => {
    let params: unknown
    route('get', '/examples', (c) => {
      params = c.params
      return page()
    })

    const result = await api.getPaginated<{ slug: string }>('/examples', { page: 2, size: 10 })

    expect(params).toEqual({ page: 2, size: 10 })
    expect(result.hasPrevious).toBe(true)
    expect(result.pageSize).toBe(10)
    expect(result).not.toHaveProperty('hasPrevios')
  })

  it('gửi bộ lọc có giá trị, bỏ undefined / null / chuỗi rỗng', async () => {
    let params: unknown
    route('get', '/materials', (c) => {
      params = c.params
      return page()
    })
    await api.getPaginated('/materials', {
      page: 1,
      size: 20,
      name: 'ốc vít',
      typeSlug: 'vat-tu',
      code: '',
      unit: undefined,
      supplier: null,
    })
    expect(params).toEqual({ page: 1, size: 20, name: 'ốc vít', typeSlug: 'vat-tu' })
  })

  it('giữ bộ lọc 0 và false — chỉ rỗng mới bị bỏ', async () => {
    let params: unknown
    route('get', '/materials', (c) => {
      params = c.params
      return page()
    })
    await api.getPaginated('/materials', { page: 1, size: 10, minQty: 0, active: false })
    expect(params).toEqual({ page: 1, size: 10, minQty: 0, active: false })
  })

  it('gửi sort (chiều) và sortBy (trường) thành hai tham số riêng; không sort thì không gửi', async () => {
    const seen: unknown[] = []
    route('get', '/materials', (c) => {
      seen.push(c.params)
      return page()
    })
    await api.getPaginated('/materials', { page: 1, size: 10, sort: 'DESC', sortBy: 'name' })
    await api.getPaginated('/materials', { page: 1, size: 10, sort: undefined })
    expect(seen[0]).toMatchObject({ sort: 'DESC', sortBy: 'name' })
    expect(seen[1]).not.toHaveProperty('sort')
    expect(seen[1]).not.toHaveProperty('sortBy')
  })
})

describe('postData / patchData / deleteData', () => {
  it('postData và patchData gửi body, trả `result`', async () => {
    route('post', '/x', () => ok({ a: 1 }))
    route('patch', '/x', () => ok({ b: 2 }))
    await expect(api.postData('/x', { n: 1 })).resolves.toEqual({ a: 1 })
    await expect(api.patchData('/x', { n: 2 })).resolves.toEqual({ b: 2 })
    expect(calls.map((c) => c.body)).toEqual([{ n: 1 }, { n: 2 }])
  })

  it('deleteData gửi body qua config.data khi có, không thì thôi', async () => {
    const seen: unknown[] = []
    route('delete', '/x', (c) => {
      seen.push(c.data)
      return ok()
    })
    await api.deleteData('/x', { slugs: ['a'] })
    await api.deleteData('/x')
    expect(JSON.parse(seen[0] as string)).toEqual({ slugs: ['a'] })
    expect(seen[1]).toBeUndefined()
  })
})

describe('xử lý lỗi', () => {
  it('reject bằng ApiError đọc từ body lỗi của backend', async () => {
    route('get', '/examples', () => ({
      status: 403,
      data: {
        statusCode: 403,
        code: 1234,
        timestamp: '',
        path: '/api/v1/examples',
        method: 'GET',
        message: 'Forbidden resource',
      },
    }))
    const e: unknown = await api.getData('/examples').catch((err: unknown) => err)
    expect(api.isApiError(e)).toBe(true)
    expect(e).toMatchObject({ message: 'Forbidden resource', code: 1234, statusCode: 403 })
  })

  it('lỗi mạng (không response) reject bằng chính AxiosError', async () => {
    route('get', '/examples', () => 'network')
    const e: unknown = await api.getData('/examples').catch((err: unknown) => err)
    expect(axios.isAxiosError(e)).toBe(true)
    expect(api.isApiError(e)).toBe(false)
  })
})

describe('401 → refresh một lần rồi gửi lại', () => {
  it('refresh thành công: lưu cặp token mới và gửi lại request với token mới', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    route('get', '/examples', (c) =>
      headerOf(c, 'Authorization') === 'Bearer acc-moi'
        ? ok({ items: [] })
        : unauthorized('/examples'),
    )
    route('post', '/auth/refresh', () => refreshed('acc-moi'))

    await expect(api.getData('/examples')).resolves.toEqual({ items: [] })
    expect(callsTo('post', '/auth/refresh')[0]?.body).toEqual({ refreshToken: 'ref-1' })
    expect(callsTo('get', '/examples').map((c) => c.auth)).toEqual([
      'Bearer acc-cu',
      'Bearer acc-moi',
    ])
    expect(getTokens()).toEqual({ accessToken: 'acc-moi', refreshToken: 'ref-2' })
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  // Review Focus #5.
  it('N request đồng thời cùng 401 → đúng 1 lần POST /auth/refresh, cả N gửi lại bằng token mới', async () => {
    const N = 8
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    for (let i = 0; i < N; i++) {
      route('get', `/examples/${i}`, (c) =>
        headerOf(c, 'Authorization') === 'Bearer acc-moi'
          ? ok({ slug: String(i) })
          : unauthorized(`/examples/${i}`),
      )
    }
    route('post', '/auth/refresh', async () => {
      await delay(20)
      return refreshed('acc-moi')
    })

    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => api.getData(`/examples/${i}`)),
    )

    expect(callsTo('post', '/auth/refresh')).toHaveLength(1)
    expect(results).toEqual(Array.from({ length: N }, (_, i) => ({ slug: String(i) })))
    // Mỗi request: một lần gửi bằng token cũ, một lần bằng token mới.
    for (let i = 0; i < N; i++) {
      expect(callsTo('get', `/examples/${i}`).map((c) => c.auth)).toEqual([
        'Bearer acc-cu',
        'Bearer acc-moi',
      ])
    }
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('token trong bộ nhớ đã đổi (request khác vừa refresh xong) → gửi lại luôn, không refresh', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    route('get', '/examples', (c) => {
      if (headerOf(c, 'Authorization') === 'Bearer acc-cu') {
        // Giả lập request khác refresh xong đúng lúc request này đang bay.
        setTokens({ accessToken: 'acc-khac', refreshToken: 'ref-1' })
        return unauthorized('/examples')
      }
      return ok({ items: [] })
    })
    route('post', '/auth/refresh', () => refreshed('khong-duoc-dung'))

    await expect(api.getData('/examples')).resolves.toEqual({ items: [] })
    expect(callsTo('post', '/auth/refresh')).toHaveLength(0)
  })

  it.each([
    [401, 100003, 'expired'],
    [401, 100004, 'expired'],
    [401, 100005, 'revoked'],
    [403, 100002, 'userInactive'],
    [400, 100008, 'unauthorized'],
  ] as const)(
    'refresh trả %i/%i → kết thúc phiên (%s), request gốc bị reject',
    async (status, code, reason) => {
      setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
      route('get', '/examples', () => unauthorized('/examples'))
      route('post', '/auth/refresh', () => errorBody(status, code))

      await expect(api.getData('/examples')).rejects.toBeTruthy()
      expect(onSessionEnd).toHaveBeenCalledTimes(1)
      expect(onSessionEnd).toHaveBeenCalledWith(reason)
    },
  )

  it('3 request cùng 401, refresh bị thu hồi → handler gọi đúng 1 lần (revoked), cả 3 reject', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    // Hợp đồng của handler: xoá token đồng bộ — nhờ vậy các lỗi đồng thời sau đó bỏ qua.
    onSessionEnd.mockImplementation(() => clearTokens())
    for (const s of ['a', 'b', 'c'])
      route('get', `/examples/${s}`, () => unauthorized(`/examples/${s}`))
    route('post', '/auth/refresh', async () => {
      await delay(20)
      return errorBody(401, 100005)
    })

    const results = await Promise.allSettled([
      api.getData('/examples/a'),
      api.getData('/examples/b'),
      api.getData('/examples/c'),
    ])

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected'])
    expect(callsTo('post', '/auth/refresh')).toHaveLength(1)
    expect(onSessionEnd).toHaveBeenCalledTimes(1)
    expect(onSessionEnd).toHaveBeenCalledWith('revoked')
  })

  it('lỗi mạng khi refresh → KHÔNG kết thúc phiên, token còn nguyên, request gốc bị reject', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    route('get', '/examples', () => unauthorized('/examples'))
    route('post', '/auth/refresh', () => 'network')

    await expect(api.getData('/examples')).rejects.toBeTruthy()
    expect(onSessionEnd).not.toHaveBeenCalled()
    expect(getTokens()).toEqual({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
  })

  it.each([408, 429, 500, 502, 503])(
    'refresh trả %i → KHÔNG kết thúc phiên, giữ token',
    async (status) => {
      setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
      route('get', '/examples', () => unauthorized('/examples'))
      route('post', '/auth/refresh', () => ({ status, data: { statusCode: status, message: 'x' } }))

      await expect(api.getData('/examples')).rejects.toBeTruthy()
      expect(onSessionEnd).not.toHaveBeenCalled()
      expect(getTokens()).toEqual({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    },
  )

  it('refresh lỗi tạm thời → lần 401 sau vẫn thử refresh lại (refreshing không kẹt)', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    let n = 0
    route('get', '/examples', (c) =>
      headerOf(c, 'Authorization') === 'Bearer acc-moi'
        ? ok({ items: [] })
        : unauthorized('/examples'),
    )
    route('post', '/auth/refresh', () => (++n === 1 ? 'network' : refreshed('acc-moi')))

    await expect(api.getData('/examples')).rejects.toBeTruthy()
    await expect(api.getData('/examples')).resolves.toEqual({ items: [] })
    expect(n).toBe(2)
  })

  it('request đã gửi lại mà vẫn 401 → kết thúc phiên (unauthorized), không refresh lần 2', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    route('get', '/examples', () => unauthorized('/examples'))
    route('post', '/auth/refresh', () => refreshed('acc-moi'))

    await expect(api.getData('/examples')).rejects.toBeTruthy()
    expect(callsTo('post', '/auth/refresh')).toHaveLength(1)
    expect(onSessionEnd).toHaveBeenCalledWith('unauthorized')
  })

  it('phiên kết thúc trong lúc refresh đang bay → không ghi lại token, reject, không gọi handler', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    let refreshStarted!: () => void
    const started = new Promise<void>((resolve) => (refreshStarted = resolve))
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    route('get', '/examples', () => unauthorized('/examples'))
    route('post', '/auth/refresh', async () => {
      refreshStarted()
      await released
      return refreshed('acc-moi')
    })

    const pending = api.getData('/examples')
    await started
    clearTokens()
    release()

    await expect(pending).rejects.toBeTruthy()
    expect(getTokens()).toBeNull()
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('đăng nhập lại (cặp khác) trong lúc refresh đang bay → không ghi đè, gửi lại bằng token đang lưu', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    const other = { accessToken: 'acc-khac', refreshToken: 'ref-khac' }
    let refreshStarted!: () => void
    const started = new Promise<void>((resolve) => (refreshStarted = resolve))
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    route('get', '/examples', (c) =>
      headerOf(c, 'Authorization') === 'Bearer acc-cu'
        ? unauthorized('/examples')
        : ok({ items: [] }),
    )
    route('post', '/auth/refresh', async () => {
      refreshStarted()
      await released
      return refreshed('acc-moi')
    })

    const pending = api.getData('/examples')
    await started
    setTokens(other)
    release()

    await expect(pending).resolves.toEqual({ items: [] })
    expect(getTokens()).toEqual(other)
    expect(callsTo('get', '/examples').map((c) => c.auth)).toEqual([
      'Bearer acc-cu',
      'Bearer acc-khac',
    ])
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('refresh bị thu hồi nhưng đã có cặp mới (vd. đổi mật khẩu) → không kết thúc phiên mới', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    const fresh = { accessToken: 'acc-moi-sau-doi-mk', refreshToken: 'ref-moi-sau-doi-mk' }
    let refreshStarted!: () => void
    const started = new Promise<void>((resolve) => (refreshStarted = resolve))
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    route('get', '/examples', (c) =>
      headerOf(c, 'Authorization') === 'Bearer acc-cu'
        ? unauthorized('/examples')
        : ok({ items: [] }),
    )
    route('post', '/auth/refresh', async () => {
      refreshStarted()
      await released
      return unauthorized('/auth/refresh', 100005)
    })

    const pending = api.getData('/examples')
    await started
    setTokens(fresh)
    release()

    await expect(pending).resolves.toEqual({ items: [] })
    expect(onSessionEnd).not.toHaveBeenCalled()
    expect(getTokens()).toEqual(fresh)
    expect(callsTo('get', '/examples').map((c) => c.auth)).toEqual([
      'Bearer acc-cu',
      'Bearer acc-moi-sau-doi-mk',
    ])
  })

  it('401 khi chưa có token → không refresh, không gọi handler', async () => {
    route('get', '/examples', () => unauthorized('/examples'))
    route('post', '/auth/refresh', () => refreshed('x'))

    await expect(api.getData('/examples')).rejects.toBeTruthy()
    expect(callsTo('post', '/auth/refresh')).toHaveLength(0)
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it.each(['/auth/login', '/auth/refresh'])(
    '401 từ POST %s → không refresh, không kết thúc phiên, reject bằng ApiError',
    async (path) => {
      setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
      route('post', path, () => errorBody(401, 100001, path))
      if (path !== '/auth/refresh') route('post', '/auth/refresh', () => refreshed('x'))

      await expect(api.postData(path, {})).rejects.toMatchObject({ statusCode: 401, code: 100001 })
      expect(callsTo('post', '/auth/refresh')).toHaveLength(path === '/auth/refresh' ? 1 : 0)
      expect(onSessionEnd).not.toHaveBeenCalled()
    },
  )

  it('403 thường → không refresh, không kết thúc phiên', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    route('get', '/examples', () => ({
      status: 403,
      data: {
        statusCode: 403,
        timestamp: '',
        path: '/examples',
        method: 'GET',
        message: 'Forbidden',
      },
    }))

    await expect(api.getData('/examples')).rejects.toMatchObject({ statusCode: 403 })
    expect(callsTo('post', '/auth/refresh')).toHaveLength(0)
    expect(onSessionEnd).not.toHaveBeenCalled()
  })
})

describe('refreshClient', () => {
  // Adapter giả không tôn trọng `timeout`, nên kiểm cấu hình lúc tạo instance: refresh treo mà không
  // có timeout thì `refreshing` treo theo và mọi 401 sau đó chờ mãi.
  it('được tạo với timeout REFRESH_TIMEOUT_MS (15s)', () => {
    jest.resetModules()
    /* eslint-disable @typescript-eslint/no-require-imports */
    const freshAxios = (require('axios') as typeof import('axios')).default
    const create = jest.spyOn(freshAxios, 'create')
    try {
      const { REFRESH_TIMEOUT_MS } = require('./http') as typeof import('./http')
      /* eslint-enable @typescript-eslint/no-require-imports */
      expect(REFRESH_TIMEOUT_MS).toBe(15_000)
      // Instance thứ hai là refreshClient (instance đầu là `http`).
      expect(create).toHaveBeenCalledTimes(2)
      expect(create.mock.calls[1]?.[0]).toMatchObject({ timeout: REFRESH_TIMEOUT_MS })
    } finally {
      create.mockRestore()
    }
  })
})

describe('isVersionConflict', () => {
  const base = { timestamp: '', path: '/examples/a', method: 'PATCH', message: 'x' }

  it('true khi backend báo xung đột version (409 + code 100800)', () => {
    expect(api.isVersionConflict({ ...base, statusCode: 409, code: 100800 })).toBe(true)
  })

  it('false với lỗi khác, kể cả 409 không có code 100800', () => {
    expect(api.isVersionConflict({ ...base, statusCode: 409 })).toBe(false)
    expect(api.isVersionConflict({ ...base, statusCode: 422, code: 999901 })).toBe(false)
    expect(api.isVersionConflict(new Error('Network Error'))).toBe(false)
  })
})

describe('isPermissionDenied', () => {
  const base = { timestamp: '', path: '/warehouses/a', method: 'DELETE' }
  // Đúng hình dạng backend trả khi `AuthorityGuard`/`HasRoleGuard` trả `false`.
  const guardDenied = { ...base, statusCode: 403, message: 'Forbidden resource' }

  it('true với 403 do guard phân quyền từ chối', () => {
    expect(api.isPermissionDenied(guardDenied)).toBe(true)
  })

  it('false với 403 nghiệp vụ có mã (vd tài khoản bị khoá 100002)', () => {
    expect(api.isPermissionDenied({ ...guardDenied, code: 100002 })).toBe(false)
  })

  it('false với 403 của FeatureGuard — không có code nhưng KHÔNG phải chuyện quyền', () => {
    expect(
      api.isPermissionDenied({
        ...base,
        statusCode: 403,
        message: 'Feature "x" is currently disabled',
      }),
    ).toBe(false)
  })

  it('false với lỗi không phải 403', () => {
    expect(api.isPermissionDenied({ ...guardDenied, statusCode: 401 })).toBe(false)
    expect(api.isPermissionDenied({ ...guardDenied, statusCode: 500 })).toBe(false)
    expect(api.isPermissionDenied(new Error('Network Error'))).toBe(false)
  })
})

describe('isCancelledRequest', () => {
  it('true với CanceledError của axios và AbortError, false với lỗi thường', () => {
    expect(api.isCancelledRequest(new axios.CanceledError('x'))).toBe(true)
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    expect(api.isCancelledRequest(abort)).toBe(true)
    expect(api.isCancelledRequest(new Error('x'))).toBe(false)
  })
})

describe('timeout mặc định', () => {
  it('request treo bị huỷ sau REQUEST_TIMEOUT_MS: AxiosError không response → thông báo mất mạng', async () => {
    jest.useFakeTimers()
    try {
      const saved = axios.defaults.adapter
      expect(api.http.defaults.timeout).toBe(api.REQUEST_TIMEOUT_MS)
      // Adapter treo mô phỏng cách axios tự áp timeout: reject ECONNABORTED khi quá giờ.
      const hanging = (config: InternalAxiosRequestConfig) =>
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new AxiosError('timeout', AxiosError.ECONNABORTED, config)),
            config.timeout,
          )
        })
      routes.set('get /hang', () => new Promise<Reply>(() => {}))
      const p = api.http.get('/hang', { adapter: hanging }).catch((e: unknown) => e)
      await jest.advanceTimersByTimeAsync(api.REQUEST_TIMEOUT_MS)
      const err = await p
      expect(err).toBeInstanceOf(AxiosError)
      expect((err as AxiosError).response).toBeUndefined()
      const t = ((k: string) => k) as never
      expect(errorMessage(err, t)).toBe('common:offline')
      expect(axios.defaults.adapter).toBe(saved)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('postFile', () => {
  let restoreFormData: () => void
  beforeAll(() => {
    restoreFormData = installRnFormData()
  })
  afterAll(() => restoreFormData())

  const file = { uri: 'file:///a.pdf', name: 'a.pdf', mimeType: 'application/pdf' }

  it('gửi RN FormData (không bị axios biến thành JSON) với Content-Type multipart, trả result', async () => {
    let seen: { data: unknown; ctype: unknown; timeout: unknown } | undefined
    route('post', '/up', (c) => {
      seen = { data: c.data, ctype: c.headers.get('Content-Type'), timeout: c.timeout }
      return ok('https://h/a-1731000000000.pdf')
    })
    await expect(api.postFile('/up', file)).resolves.toBe('https://h/a-1731000000000.pdf')
    expect(seen!.data).toBeInstanceOf(FormData)
    expect((seen!.data as { _parts: unknown[] })._parts).toEqual([
      ['file', { uri: 'file:///a.pdf', name: 'a.pdf', type: 'application/pdf' }],
    ])
    expect(String(seen!.ctype)).toContain('multipart/form-data')
    expect(seen!.timeout).toBe(api.UPLOAD_TIMEOUT_MS)
    expect(api.UPLOAD_TIMEOUT_MS).toBe(120_000)
  })

  it('opts.timeoutMs ghi đè hết giờ mặc định', async () => {
    let timeout: unknown
    route('post', '/up', (c) => {
      timeout = c.timeout
      return ok('u')
    })
    await api.postFile('/up', file, { timeoutMs: 5_000 })
    expect(timeout).toBe(5_000)
  })

  it('401 → refresh → gửi lại: lần hai vẫn là cùng FormData còn nguyên trường file', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    const bodies: unknown[] = []
    route('post', '/up', (c) => {
      bodies.push(c.data)
      return headerOf(c, 'Authorization') === 'Bearer acc-moi' ? ok('u') : unauthorized('/up')
    })
    route('post', '/auth/refresh', () => refreshed('acc-moi'))
    await expect(api.postFile('/up', file)).resolves.toBe('u')
    expect(bodies).toHaveLength(2)
    for (const b of bodies) {
      expect(b).toBeInstanceOf(FormData)
      expect((b as { _parts: unknown[] })._parts).toEqual([
        ['file', { uri: 'file:///a.pdf', name: 'a.pdf', type: 'application/pdf' }],
      ])
    }
  })
})
