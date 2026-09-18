import { HttpResponse, delay, http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/shared/test/msw'
import {
  getData,
  getPaginated,
  isApiError,
  isVersionConflict,
  postData,
  setSessionEndHandler,
} from '@/shared/api/http'
import { clearTokens, getTokens, setTokens } from '@/shared/api/token-storage'
import type { SessionEndReason } from '@/shared/api/types'

const BASE = 'http://localhost:8085/api/v1'

let onSessionEnd: ReturnType<typeof vi.fn<(reason: SessionEndReason) => void>>

beforeEach(() => {
  onSessionEnd = vi.fn<(reason: SessionEndReason) => void>()
  setSessionEndHandler(onSessionEnd)
})

const unauthorized = (path: string, code?: number) =>
  HttpResponse.json(
    {
      statusCode: 401,
      ...(code ? { code } : {}),
      timestamp: '',
      path,
      method: 'GET',
      message: 'Unauthorized',
    },
    { status: 401 },
  )

const ok = (result: unknown = {}) =>
  HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result })

const refreshed = (accessToken: string, refreshToken = 'ref-2') =>
  ok({ accessToken, refreshToken, expireTime: '', expireTimeRefreshToken: '' })

describe('getData', () => {
  it('bóc `result` ra khỏi envelope', async () => {
    server.use(
      mswHttp.get(`${BASE}/examples/abc`, () =>
        HttpResponse.json({
          message: 'ok',
          statusCode: 200,
          timestamp: '2026-07-09T00:00:00.000Z',
          result: { id: '1', slug: 'abc', name: 'Example A' },
        }),
      ),
    )

    await expect(getData(`/examples/abc`)).resolves.toEqual({
      id: '1',
      slug: 'abc',
      name: 'Example A',
    })
  })

  it('gắn Bearer token đọc từ token-storage tại thời điểm gửi', async () => {
    setTokens({ accessToken: 'tok-123', refreshToken: 'ref-1' })
    let seen: string | null = null
    server.use(
      mswHttp.get(`${BASE}/auth/me`, ({ request }) => {
        seen = request.headers.get('authorization')
        return ok()
      }),
    )

    await getData('/auth/me')
    expect(seen).toBe('Bearer tok-123')
  })

  it('không gắn header Authorization khi chưa có token', async () => {
    let seen: string | null = 'chưa gán'

    server.use(
      mswHttp.get(`${BASE}/auth/me`, ({ request }) => {
        seen = request.headers.get('authorization')
        return HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: {} })
      }),
    )

    await getData('/auth/me')
    expect(seen).toBeNull()
  })
})

describe('getPaginated', () => {
  it('gửi `size` lên nhưng đọc `pageSize` về, và đổi `hasPrevios` thành `hasPrevious`', async () => {
    let seenQuery = ''

    server.use(
      mswHttp.get(`${BASE}/examples`, ({ request }) => {
        seenQuery = new URL(request.url).search
        return HttpResponse.json({
          message: 'ok',
          statusCode: 200,
          timestamp: '',
          result: {
            items: [{ slug: 'a' }],
            total: 12,
            page: 2,
            pageSize: 10,
            totalPages: 2,
            hasNext: false,
            hasPrevios: true,
          },
        })
      }),
    )

    const result = await getPaginated<{ slug: string }>('/examples', { page: 2, size: 10 })

    expect(seenQuery).toContain('size=10')
    expect(seenQuery).toContain('page=2')
    expect(result.hasPrevious).toBe(true)
    expect(result.pageSize).toBe(10)
    expect(result).not.toHaveProperty('hasPrevios')
  })
})

describe('getPaginated — bộ lọc', () => {
  it('gửi bộ lọc có giá trị, bỏ undefined / null / chuỗi rỗng', async () => {
    let params = new URLSearchParams()
    server.use(
      mswHttp.get(`${BASE}/materials`, ({ request }) => {
        params = new URL(request.url).searchParams
        return ok({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
          hasNext: false,
          hasPrevios: false,
        })
      }),
    )

    await getPaginated('/materials', {
      page: 1,
      size: 20,
      name: 'ốc vít',
      typeSlug: 'vat-tu',
      code: '',
      unit: undefined,
      supplier: null,
    })

    expect(params.toString()).toBe(
      new URLSearchParams({ page: '1', size: '20', name: 'ốc vít', typeSlug: 'vat-tu' }).toString(),
    )
  })

  it('giữ bộ lọc 0 và false — chỉ rỗng mới bị bỏ', async () => {
    let params = new URLSearchParams()
    server.use(
      mswHttp.get(`${BASE}/materials`, ({ request }) => {
        params = new URL(request.url).searchParams
        return ok({
          items: [],
          total: 0,
          page: 1,
          pageSize: 10,
          totalPages: 0,
          hasNext: false,
          hasPrevios: false,
        })
      }),
    )

    await getPaginated('/materials', { page: 1, size: 10, minQty: 0, active: false })

    expect(params.toString()).toBe(
      new URLSearchParams({ page: '1', size: '10', minQty: '0', active: 'false' }).toString(),
    )
  })
})

describe('xử lý lỗi', () => {
  it('reject bằng ApiError đọc từ body lỗi của backend', async () => {
    server.use(
      mswHttp.get(`${BASE}/examples`, () =>
        HttpResponse.json(
          {
            statusCode: 403,
            code: 1234,
            timestamp: '2026-07-09T00:00:00.000Z',
            path: '/api/v1/examples',
            method: 'GET',
            message: 'Forbidden resource',
          },
          { status: 403 },
        ),
      ),
    )

    try {
      await getData('/examples')
      expect.unreachable('lẽ ra phải throw')
    } catch (e) {
      expect(isApiError(e)).toBe(true)
      if (isApiError(e)) {
        expect(e.message).toBe('Forbidden resource')
        expect(e.code).toBe(1234)
        expect(e.statusCode).toBe(403)
      }
    }
  })
})

describe('401 → refresh một lần rồi gửi lại', () => {
  it('refresh thành công: lưu cặp token mới và gửi lại request với token mới', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    const seenAuth: (string | null)[] = []
    let refreshBody: unknown
    server.use(
      mswHttp.get(`${BASE}/examples`, ({ request }) => {
        const auth = request.headers.get('authorization')
        seenAuth.push(auth)
        return auth === 'Bearer acc-moi' ? ok({ items: [] }) : unauthorized('/examples')
      }),
      mswHttp.post(`${BASE}/auth/refresh`, async ({ request }) => {
        refreshBody = await request.json()
        return refreshed('acc-moi')
      }),
    )

    await expect(getData('/examples')).resolves.toEqual({ items: [] })
    expect(refreshBody).toEqual({ refreshToken: 'ref-1' })
    expect(seenAuth).toEqual(['Bearer acc-cu', 'Bearer acc-moi'])
    expect(getTokens()).toEqual({ accessToken: 'acc-moi', refreshToken: 'ref-2' })
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('3 request cùng 401 → đúng 1 lần refresh, cả 3 được gửi lại và thành công', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    let refreshCalls = 0
    server.use(
      mswHttp.get(`${BASE}/examples/:slug`, ({ request, params }) =>
        request.headers.get('authorization') === 'Bearer acc-moi'
          ? ok({ slug: params.slug })
          : unauthorized(`/examples/${String(params.slug)}`),
      ),
      mswHttp.post(`${BASE}/auth/refresh`, async () => {
        refreshCalls += 1
        await delay(20)
        return refreshed('acc-moi')
      }),
    )

    const results = await Promise.all([
      getData('/examples/a'),
      getData('/examples/b'),
      getData('/examples/c'),
    ])

    expect(refreshCalls).toBe(1)
    expect(results).toEqual([{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }])
  })

  it('token trong storage đã đổi (request/tab khác vừa refresh) → gửi lại luôn, không refresh', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    let refreshCalls = 0
    server.use(
      mswHttp.get(`${BASE}/examples`, ({ request }) => {
        if (request.headers.get('authorization') === 'Bearer acc-cu') {
          // Giả lập tab khác refresh xong đúng lúc request này đang bay.
          setTokens({ accessToken: 'acc-tab-khac', refreshToken: 'ref-1' })
          return unauthorized('/examples')
        }
        return ok({ items: [] })
      }),
      mswHttp.post(`${BASE}/auth/refresh`, () => {
        refreshCalls += 1
        return refreshed('khong-duoc-dung')
      }),
    )

    await expect(getData('/examples')).resolves.toEqual({ items: [] })
    expect(refreshCalls).toBe(0)
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
      server.use(
        mswHttp.get(`${BASE}/examples`, () => unauthorized('/examples')),
        mswHttp.post(`${BASE}/auth/refresh`, () =>
          HttpResponse.json(
            {
              statusCode: status,
              code,
              timestamp: '',
              path: '/auth/refresh',
              method: 'POST',
              message: 'x',
            },
            { status },
          ),
        ),
      )

      await expect(getData('/examples')).rejects.toBeTruthy()
      expect(onSessionEnd).toHaveBeenCalledTimes(1)
      expect(onSessionEnd).toHaveBeenCalledWith(reason)
    },
  )

  it('3 request cùng 401, refresh bị thu hồi → handler gọi đúng 1 lần (revoked), cả 3 reject', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    // Hợp đồng của handler: xoá token đồng bộ — nhờ vậy các lỗi đồng thời sau đó bỏ qua.
    onSessionEnd.mockImplementation(() => clearTokens())
    let refreshCalls = 0
    server.use(
      mswHttp.get(`${BASE}/examples/:slug`, ({ params }) =>
        unauthorized(`/examples/${String(params.slug)}`),
      ),
      mswHttp.post(`${BASE}/auth/refresh`, async () => {
        refreshCalls += 1
        await delay(20)
        return HttpResponse.json(
          {
            statusCode: 401,
            code: 100005,
            timestamp: '',
            path: '/auth/refresh',
            method: 'POST',
            message: 'x',
          },
          { status: 401 },
        )
      }),
    )

    const results = await Promise.allSettled([
      getData('/examples/a'),
      getData('/examples/b'),
      getData('/examples/c'),
    ])

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected'])
    expect(refreshCalls).toBe(1)
    expect(onSessionEnd).toHaveBeenCalledTimes(1)
    expect(onSessionEnd).toHaveBeenCalledWith('revoked')
  })

  it('lỗi mạng khi refresh → KHÔNG kết thúc phiên, request gốc bị reject', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    server.use(
      mswHttp.get(`${BASE}/examples`, () => unauthorized('/examples')),
      mswHttp.post(`${BASE}/auth/refresh`, () => HttpResponse.error()),
    )

    await expect(getData('/examples')).rejects.toBeTruthy()
    expect(onSessionEnd).not.toHaveBeenCalled()
    expect(getTokens()).toEqual({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
  })

  it.each([408, 429])(
    'refresh trả %i (quá hạn chờ / bị giới hạn tần suất) → KHÔNG kết thúc phiên, giữ token',
    async (status) => {
      setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
      server.use(
        mswHttp.get(`${BASE}/examples`, () => unauthorized('/examples')),
        mswHttp.post(`${BASE}/auth/refresh`, () =>
          HttpResponse.json({ statusCode: status, message: 'x' }, { status }),
        ),
      )

      await expect(getData('/examples')).rejects.toBeTruthy()
      expect(onSessionEnd).not.toHaveBeenCalled()
      expect(getTokens()).toEqual({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    },
  )

  it('5xx khi refresh → KHÔNG kết thúc phiên', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    server.use(
      mswHttp.get(`${BASE}/examples`, () => unauthorized('/examples')),
      mswHttp.post(`${BASE}/auth/refresh`, () =>
        HttpResponse.json({ statusCode: 500, message: 'boom' }, { status: 500 }),
      ),
    )

    await expect(getData('/examples')).rejects.toBeTruthy()
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('request đã gửi lại mà vẫn 401 → kết thúc phiên (unauthorized), không refresh lần 2', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    let refreshCalls = 0
    server.use(
      mswHttp.get(`${BASE}/examples`, () => unauthorized('/examples')),
      mswHttp.post(`${BASE}/auth/refresh`, () => {
        refreshCalls += 1
        return refreshed('acc-moi')
      }),
    )

    await expect(getData('/examples')).rejects.toBeTruthy()
    expect(refreshCalls).toBe(1)
    expect(onSessionEnd).toHaveBeenCalledWith('unauthorized')
  })

  it('phiên kết thúc trong lúc refresh đang bay → không ghi lại token, reject, không gọi handler', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    let refreshStarted!: () => void
    const started = new Promise<void>((resolve) => (refreshStarted = resolve))
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    server.use(
      mswHttp.get(`${BASE}/examples`, ({ request }) =>
        request.headers.get('authorization') === 'Bearer acc-moi'
          ? ok({ items: [] })
          : unauthorized('/examples'),
      ),
      mswHttp.post(`${BASE}/auth/refresh`, async () => {
        refreshStarted()
        await released
        return refreshed('acc-moi')
      }),
    )

    const pending = getData('/examples')
    await started
    clearTokens()
    release()

    await expect(pending).rejects.toBeTruthy()
    expect(getTokens()).toBeNull()
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('storage đổi sang cặp khác trong lúc refresh đang bay → không ghi đè, gửi lại bằng token đang lưu', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    const other = { accessToken: 'acc-tab-khac', refreshToken: 'ref-tab-khac' }
    const seenAuth: (string | null)[] = []
    let refreshStarted!: () => void
    const started = new Promise<void>((resolve) => (refreshStarted = resolve))
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    server.use(
      mswHttp.get(`${BASE}/examples`, ({ request }) => {
        const auth = request.headers.get('authorization')
        seenAuth.push(auth)
        return auth === 'Bearer acc-cu' ? unauthorized('/examples') : ok({ items: [] })
      }),
      mswHttp.post(`${BASE}/auth/refresh`, async () => {
        refreshStarted()
        await released
        return refreshed('acc-moi')
      }),
    )

    const pending = getData('/examples')
    await started
    setTokens(other)
    release()

    await expect(pending).resolves.toEqual({ items: [] })
    expect(getTokens()).toEqual(other)
    expect(seenAuth).toEqual(['Bearer acc-cu', 'Bearer acc-tab-khac'])
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('refresh bị thu hồi nhưng storage đã đổi sang cặp mới (vd. đổi mật khẩu) → không kết thúc phiên mới', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    const fresh = { accessToken: 'acc-moi-sau-doi-mk', refreshToken: 'ref-moi-sau-doi-mk' }
    const seenAuth: (string | null)[] = []
    let refreshStarted!: () => void
    const started = new Promise<void>((resolve) => (refreshStarted = resolve))
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    server.use(
      mswHttp.get(`${BASE}/examples`, ({ request }) => {
        const auth = request.headers.get('authorization')
        seenAuth.push(auth)
        return auth === 'Bearer acc-cu' ? unauthorized('/examples') : ok({ items: [] })
      }),
      mswHttp.post(`${BASE}/auth/refresh`, async () => {
        refreshStarted()
        await released
        return unauthorized('/auth/refresh', 100005)
      }),
    )

    const pending = getData('/examples')
    await started
    setTokens(fresh)
    release()

    await expect(pending).resolves.toEqual({ items: [] })
    expect(onSessionEnd).not.toHaveBeenCalled()
    expect(getTokens()).toEqual(fresh)
    expect(seenAuth).toEqual(['Bearer acc-cu', 'Bearer acc-moi-sau-doi-mk'])
  })

  it('401 khi chưa có token → không refresh, không gọi handler', async () => {
    let refreshCalls = 0
    server.use(
      mswHttp.get(`${BASE}/examples`, () => unauthorized('/examples')),
      mswHttp.post(`${BASE}/auth/refresh`, () => {
        refreshCalls += 1
        return refreshed('x')
      }),
    )

    await expect(getData('/examples')).rejects.toBeTruthy()
    expect(refreshCalls).toBe(0)
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it.each([
    ['post', '/auth/login'],
    ['post', '/auth/refresh'],
  ] as const)(
    '401 từ %s %s → không refresh, không kết thúc phiên, reject bằng ApiError',
    async (_, path) => {
      setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
      let refreshCalls = 0
      server.use(
        mswHttp.post(`${BASE}${path}`, () =>
          HttpResponse.json(
            { statusCode: 401, code: 100001, timestamp: '', path, method: 'POST', message: 'x' },
            { status: 401 },
          ),
        ),
      )
      if (path !== '/auth/refresh') {
        server.use(
          mswHttp.post(`${BASE}/auth/refresh`, () => {
            refreshCalls += 1
            return refreshed('x')
          }),
        )
      }

      await expect(postData(path, {})).rejects.toMatchObject({ statusCode: 401, code: 100001 })
      expect(refreshCalls).toBe(0)
      expect(onSessionEnd).not.toHaveBeenCalled()
    },
  )

  it('403 thường → không refresh, không kết thúc phiên', async () => {
    setTokens({ accessToken: 'acc-cu', refreshToken: 'ref-1' })
    server.use(
      mswHttp.get(`${BASE}/examples`, () =>
        HttpResponse.json(
          {
            statusCode: 403,
            timestamp: '',
            path: '/examples',
            method: 'GET',
            message: 'Forbidden',
          },
          { status: 403 },
        ),
      ),
    )

    await expect(getData('/examples')).rejects.toMatchObject({ statusCode: 403 })
    expect(onSessionEnd).not.toHaveBeenCalled()
  })
})

describe('refreshClient', () => {
  // MSW giả lập XHR không tôn trọng `timeout`, nên không dựng được một refresh treo thật một cách
  // tất định. Kiểm cấu hình lúc tạo instance: refresh treo mà không có timeout thì `refreshing`
  // treo theo và mọi 401 sau đó chờ mãi.
  it('được tạo với timeout REFRESH_TIMEOUT_MS (15s)', async () => {
    vi.resetModules()
    const { default: freshAxios } = await import('axios')
    const create = vi.spyOn(freshAxios, 'create')
    try {
      const { REFRESH_TIMEOUT_MS } = await import('@/shared/api/http')
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
    expect(isVersionConflict({ ...base, statusCode: 409, code: 100800 })).toBe(true)
  })

  it('false với lỗi khác, kể cả 409 không có code 100800', () => {
    expect(isVersionConflict({ ...base, statusCode: 409 })).toBe(false)
    expect(isVersionConflict({ ...base, statusCode: 422, code: 999901 })).toBe(false)
    expect(isVersionConflict(new Error('Network Error'))).toBe(false)
  })
})
