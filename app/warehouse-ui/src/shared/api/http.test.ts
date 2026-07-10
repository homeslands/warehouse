import { HttpResponse, http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw'
import {
  getData,
  getPaginated,
  isApiError,
  postData,
  setAuthTokenGetter,
  setUnauthorizedHandler,
} from '@/shared/api/http'

const BASE = 'http://localhost:8085/api/v1'

beforeEach(() => {
  setAuthTokenGetter(() => null)
  setUnauthorizedHandler(() => {})
})

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

  it('gắn Bearer token khi getter trả về token', async () => {
    setAuthTokenGetter(() => 'tok-123')
    let seen: string | null = null

    server.use(
      mswHttp.get(`${BASE}/auth/me`, ({ request }) => {
        seen = request.headers.get('authorization')
        return HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: {} })
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

  it('gọi unauthorizedHandler đúng một lần khi gặp 401', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)

    server.use(
      mswHttp.get(`${BASE}/auth/me`, () =>
        HttpResponse.json(
          { statusCode: 401, timestamp: '', path: '/api/v1/auth/me', method: 'GET', message: 'Unauthorized' },
          { status: 401 },
        ),
      ),
    )

    await expect(getData('/auth/me')).rejects.toBeDefined()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('KHÔNG gọi unauthorizedHandler khi gặp 403', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)

    server.use(
      mswHttp.get(`${BASE}/examples`, () =>
        HttpResponse.json(
          { statusCode: 403, timestamp: '', path: '/api/v1/examples', method: 'GET', message: 'Forbidden' },
          { status: 403 },
        ),
      ),
    )

    await expect(getData('/examples')).rejects.toBeDefined()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('KHÔNG gọi onUnauthorized khi 401 đến từ chính request đăng nhập', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)

    server.use(
      mswHttp.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          {
            statusCode: 401,
            code: 100001,
            timestamp: '',
            path: '/auth/login',
            method: 'POST',
            message: 'Invalid phone number or password',
          },
          { status: 401 },
        ),
      ),
    )

    await expect(postData('/auth/login', { phonenumber: 'x', password: 'y' })).rejects.toMatchObject({
      code: 100001,
    })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('VẪN gọi onUnauthorized khi 401 đến từ request thường', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)

    server.use(
      mswHttp.get(`${BASE}/examples`, () =>
        HttpResponse.json(
          {
            statusCode: 401,
            timestamp: '',
            path: '/examples',
            method: 'GET',
            message: 'Unauthorized',
          },
          { status: 401 },
        ),
      ),
    )

    await expect(getData('/examples')).rejects.toBeTruthy()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
})
