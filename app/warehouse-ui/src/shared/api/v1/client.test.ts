/**
 * Client `/api/v1` với MSW — MOCK đúng hình dạng OpenAPI R2, không gọi API thật (BE #197 còn draft).
 * Cookie CSRF `wh_csrf` cũng là MOCK (jsdom chạy HTTP → tên dev theo BE Q2).
 */
import { http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionEndReason } from '@/shared/api/types'
import {
  V1_BASE,
  setCsrfCookie,
  v1Action,
  v1LoginResult,
  v1error,
  v1ok,
} from '@/shared/test/api-v1'
import { server } from '@/shared/test/msw'
import { apiV1Http, setV1SessionHooks, v1Get, v1Post } from './client'
import {
  V1_SESSION_STORAGE_KEY,
  clearCredentials,
  getAccessToken,
  lockCredentials,
  readCsrfCookie,
  readSessionMarker,
  storeSessionCredentials,
} from './credentials'
import { ApiV1Error, V1NetworkError, V1ProtocolError } from './errors'
import { V1_REFRESH_LOCK } from './refresh-mutex'
import { isLockReason } from './session-end'

const SESSION_ID = '33333333-3333-4333-8333-333333333333'
const INITIAL_CSRF = 'csrf-initial-000000'

let onSessionEnd: ReturnType<typeof vi.fn<(reason: SessionEndReason) => void>>
let refreshCalls: { csrf: string | null; credentials: RequestCredentials; auth: string | null }[]

beforeEach(() => {
  refreshCalls = []
  // Như handler thật (`endV1Session`): đổi credentials ĐỒNG BỘ.
  onSessionEnd = vi.fn<(reason: SessionEndReason) => void>((reason) => {
    if (isLockReason(reason)) lockCredentials()
    else clearCredentials()
  })
  setV1SessionHooks({ onSessionEnd })
  storeSessionCredentials({
    accessToken: 'access-old',
    csrfToken: INITIAL_CSRF,
    sessionId: SESSION_ID,
  })
})

afterEach(() => {
  clearCredentials()
  setV1SessionHooks({ onSessionEnd: () => {} })
  vi.unstubAllGlobals()
})

/** `/auth/refresh` trả `respond()`; ghi lại header CSRF + credentials của từng lần gọi. */
function onRefresh(respond: () => Response | Promise<Response>) {
  server.use(
    mswHttp.post(`${V1_BASE}/auth/refresh`, ({ request }) => {
      refreshCalls.push({
        csrf: request.headers.get('X-CSRF-Token'),
        credentials: request.credentials,
        auth: request.headers.get('Authorization'),
      })
      return respond()
    }),
  )
}

/** `/things` trả 401 với token cũ, 200 với token đã refresh. */
function protectedThings(expiredKey = 'SESSION_ACCESS_TOKEN_EXPIRED') {
  const seen: (string | null)[] = []
  server.use(
    mswHttp.get(`${V1_BASE}/things`, ({ request }) => {
      const auth = request.headers.get('Authorization')
      seen.push(auth)
      if (auth === 'Bearer access-old') return v1error(401, expiredKey)
      return v1ok({ by: auth })
    }),
  )
  return seen
}

describe('envelope + lỗi có kiểu', () => {
  it('gắn Bearer từ memory, trả `result` của envelope', async () => {
    server.use(
      mswHttp.get(`${V1_BASE}/things`, ({ request }) =>
        v1ok({ auth: request.headers.get('Authorization') }),
      ),
    )
    await expect(v1Get('/things')).resolves.toEqual({ auth: 'Bearer access-old' })
  })

  it('envelope thiếu traceId → V1ProtocolError (không nhận như legacy)', async () => {
    server.use(
      mswHttp.get(`${V1_BASE}/things`, () =>
        Response.json({ message: 'ok', statusCode: 200, timestamp: 't', result: 1 }),
      ),
    )
    await expect(v1Get('/things')).rejects.toBeInstanceOf(V1ProtocolError)
  })

  it('409 → ApiV1Error mang errorKey/traceId, không refresh, không kết thúc phiên', async () => {
    onRefresh(() => v1ok(v1LoginResult()))
    server.use(mswHttp.post(`${V1_BASE}/things`, () => v1error(409, 'VERSION_CONFLICT')))
    const error = await v1Post('/things').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiV1Error)
    expect(error).toMatchObject({ statusCode: 409, errorKey: 'VERSION_CONFLICT' })
    expect(refreshCalls).toHaveLength(0)
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('mất mạng → V1NetworkError, không kết thúc phiên', async () => {
    server.use(mswHttp.get(`${V1_BASE}/things`, () => Response.error()))
    await expect(v1Get('/things')).rejects.toBeInstanceOf(V1NetworkError)
    expect(onSessionEnd).not.toHaveBeenCalled()
  })
})

describe('cookie chỉ đi kèm path auth cần nó (review r1 L2)', () => {
  it('login/logout/logout-all: credentials include; request nghiệp vụ, /auth/me, /auth/activity, /auth/lock: không', async () => {
    const seen: Record<string, RequestCredentials> = {}
    const record = (name: string, body: () => Response) =>
      mswHttp.all(`${V1_BASE}${name}`, ({ request }) => {
        seen[name] = request.credentials
        return body()
      })
    server.use(
      record('/auth/login', () => v1ok(v1LoginResult())),
      record('/auth/logout', () => v1ok(v1Action())),
      record('/auth/logout-all', () => v1ok(v1Action())),
      record('/auth/activity', () => v1ok(v1Action())),
      record('/auth/lock', () => v1ok(v1Action())),
      record('/auth/me', () => v1ok({})),
      record('/things', () => v1ok(1)),
    )
    await v1Post('/auth/login', { phoneNumber: 'x', password: 'y' })
    await v1Post('/auth/logout')
    await v1Post('/auth/logout-all')
    await v1Post('/auth/activity')
    await v1Post('/auth/lock')
    await v1Get('/auth/me')
    await v1Get('/things')
    expect(seen).toEqual({
      '/auth/login': 'include',
      '/auth/logout': 'include',
      '/auth/logout-all': 'include',
      '/auth/activity': 'same-origin',
      '/auth/lock': 'same-origin',
      '/auth/me': 'same-origin',
      '/things': 'same-origin',
    })
  })
})

describe('refresh qua cookie + X-CSRF-Token, single-flight', () => {
  it('3 request 401 cùng lúc → đúng 1 refresh (CSRF trong memory, cookie include, KHÔNG Bearer); cả 3 gửi lại bằng token mới', async () => {
    const rotated = v1LoginResult({ accessToken: 'access-new', csrfToken: 'csrf-rotated-000001' })
    onRefresh(() => v1ok(rotated))
    const seen = protectedThings()

    const results = await Promise.all([v1Get('/things'), v1Get('/things'), v1Get('/things')])

    expect(results).toEqual(Array(3).fill({ by: 'Bearer access-new' }))
    expect(refreshCalls).toEqual([{ csrf: INITIAL_CSRF, credentials: 'include', auth: null }])
    expect(seen.filter((a) => a === 'Bearer access-new')).toHaveLength(3)
    expect(readSessionMarker()).toEqual({ sessionId: rotated.sessionId, locked: false })
    expect(getAccessToken()).toBe('access-new')
    // Review r1 M2 / BE Q2: localStorage không chứa access lẫn CSRF.
    const stored = localStorage.getItem(V1_SESSION_STORAGE_KEY) ?? ''
    expect(stored).not.toContain('access-new')
    expect(stored).not.toContain('csrf')
  })

  it('cookie CSRF có (tab khác vừa rotate / sau reload) → dùng cookie thay bản trong memory', async () => {
    setCsrfCookie('csrf-from-cookie-0001')
    onRefresh(() => v1ok(v1LoginResult({ accessToken: 'access-new' })))
    protectedThings()
    await v1Get('/things')
    expect(refreshCalls.map((c) => c.csrf)).toEqual(['csrf-from-cookie-0001'])
  })

  it('refresh 401 SESSION_IDLE_EXPIRED (polling không gia hạn idle) → onSessionEnd("idle") ĐÚNG 1 lần, không gửi lại', async () => {
    onRefresh(() => v1error(401, 'SESSION_IDLE_EXPIRED'))
    const seen = protectedThings()

    const settled = await Promise.allSettled([v1Get('/things'), v1Get('/things')])

    expect(settled.every((r) => r.status === 'rejected')).toBe(true)
    expect(refreshCalls).toHaveLength(1)
    expect(seen).toEqual(['Bearer access-old', 'Bearer access-old'])
    expect(onSessionEnd.mock.calls).toEqual([['idle']])
    expect(readSessionMarker()?.locked).toBe(true)
  })

  it('refresh 403 GATEWAY_CSRF_INVALID → GIỮ phiên (BE Q1: 403 không phải lỗi phiên), request bị reject', async () => {
    onRefresh(() => v1error(403, 'GATEWAY_CSRF_INVALID'))
    protectedThings()
    await expect(v1Get('/things')).rejects.toMatchObject({ errorKey: 'GATEWAY_CSRF_INVALID' })
    expect(onSessionEnd).not.toHaveBeenCalled()
    expect(readSessionMarker()?.locked).toBe(false)
  })

  it.each([
    ['SESSION_REFRESH_TOKEN_REUSED', 'revoked'],
    ['SESSION_REFRESH_TOKEN_INVALID', 'unauthorized'],
    ['GATEWAY_REFRESH_COOKIE_MISSING', 'unauthorized'],
  ] as const)('refresh 401 %s → onSessionEnd("%s")', async (key, reason) => {
    onRefresh(() => v1error(401, key))
    protectedThings()
    await expect(v1Get('/things')).rejects.toBeInstanceOf(ApiV1Error)
    expect(onSessionEnd.mock.calls).toEqual([[reason]])
  })

  it.each([
    ['503', () => v1error(503, 'SESSION_STORE_UNAVAILABLE')],
    ['429', () => v1error(429, 'SESSION_REFRESH_RATE_LIMITED')],
    ['mất mạng', () => Response.error()],
  ])('refresh lỗi tạm thời (%s) → giữ phiên + CSRF, reject lỗi của refresh', async (_, respond) => {
    onRefresh(respond)
    protectedThings()
    await expect(v1Get('/things')).rejects.toBeDefined()
    expect(onSessionEnd).not.toHaveBeenCalled()
    expect(readSessionMarker()?.locked).toBe(false)
  })

  it('refresh thành công nhưng gửi lại vẫn 401 → onSessionEnd("unauthorized"), KHÔNG refresh lần 2 (không vòng lặp)', async () => {
    onRefresh(() => v1ok(v1LoginResult({ accessToken: 'access-new' })))
    let calls = 0
    server.use(
      mswHttp.get(`${V1_BASE}/things`, () => {
        calls += 1
        return v1error(401, 'SESSION_ACCESS_TOKEN_INVALID')
      }),
    )
    await expect(v1Get('/things')).rejects.toBeInstanceOf(ApiV1Error)
    expect(refreshCalls).toHaveLength(1)
    expect(calls).toBe(2)
    expect(onSessionEnd.mock.calls).toEqual([['unauthorized']])
  })

  it('refresh trả LoginResult thiếu csrfToken → lỗi giao thức: không lưu nửa vời, không kết thúc phiên', async () => {
    const broken: Partial<ReturnType<typeof v1LoginResult>> = v1LoginResult()
    delete broken.csrfToken
    onRefresh(() => v1ok(broken))
    protectedThings()
    await expect(v1Get('/things')).rejects.toBeInstanceOf(V1ProtocolError)
    expect(getAccessToken()).toBe('access-old')
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('khoá trong lúc refresh đang bay → không ghi lại credentials, xoá cookie CSRF server vừa đặt', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    onRefresh(async () => {
      await gate
      // Server rotate: đặt cookie CSRF mới kèm response (MOCK).
      setCsrfCookie('csrf-set-by-refresh-01')
      return v1ok(v1LoginResult({ accessToken: 'access-new' }))
    })
    protectedThings()
    const pending = v1Get('/things')
    await vi.waitFor(() => expect(refreshCalls).toHaveLength(1))
    lockCredentials()
    release()
    await expect(pending).rejects.toBeInstanceOf(ApiV1Error)
    expect(getAccessToken()).toBeNull()
    expect(readCsrfCookie()).toBeNull()
    expect(readSessionMarker()?.locked).toBe(true)
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('đăng xuất trong lúc refresh đang bay → không ghi lại credentials, không gọi handler', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    onRefresh(async () => {
      await gate
      return v1ok(v1LoginResult({ accessToken: 'access-new' }))
    })
    protectedThings()
    const pending = v1Get('/things')
    await vi.waitFor(() => expect(refreshCalls).toHaveLength(1))
    clearCredentials()
    release()
    await expect(pending).rejects.toBeInstanceOf(ApiV1Error)
    expect(readSessionMarker()).toBeNull()
    expect(getAccessToken()).toBeNull()
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('có Web Locks → refresh chạy trong lock tên chung giữa các tab', async () => {
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task())
    vi.stubGlobal('navigator', { ...navigator, locks: { request } })
    onRefresh(() => v1ok(v1LoginResult({ accessToken: 'access-new' })))
    protectedThings()
    await v1Get('/things')
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]?.[0]).toBe(V1_REFRESH_LOCK)
  })

  it('không có Web Locks (jsdom) → refresh chạy trong mutex localStorage', async () => {
    expect('locks' in navigator).toBe(false)
    const holderDuringRefresh: (string | null)[] = []
    onRefresh(() => {
      holderDuringRefresh.push(localStorage.getItem('warehouse.auth.v1.refresh-lock'))
      return v1ok(v1LoginResult({ accessToken: 'access-new' }))
    })
    protectedThings()
    await v1Get('/things')
    expect(holderDuringRefresh[0]).toContain('"owner"')
    expect(localStorage.getItem('warehouse.auth.v1.refresh-lock')).toBeNull()
  })
})

describe('401 không đi refresh', () => {
  it('401 terminal SESSION_REVOKED ở request được bảo vệ → kết thúc ngay ("revoked"), không refresh', async () => {
    onRefresh(() => v1ok(v1LoginResult()))
    protectedThings('SESSION_REVOKED')
    await expect(v1Get('/things')).rejects.toMatchObject({ errorKey: 'SESSION_REVOKED' })
    expect(refreshCalls).toHaveLength(0)
    expect(onSessionEnd.mock.calls).toEqual([['revoked']])
  })

  it('401 terminal SESSION_LOCKED → khoá ("locked"): bỏ access + CSRF, xoá cookie CSRF, marker locked', async () => {
    setCsrfCookie('csrf-cookie-before-lock')
    protectedThings('SESSION_LOCKED')
    await expect(v1Get('/things')).rejects.toBeInstanceOf(ApiV1Error)
    expect(onSessionEnd.mock.calls).toEqual([['locked']])
    expect(readSessionMarker()).toEqual({ sessionId: SESSION_ID, locked: true })
    expect(getAccessToken()).toBeNull()
    expect(readCsrfCookie()).toBeNull()
  })

  it('401 của /auth/login (sai mật khẩu) → reject, không refresh, không kết thúc phiên', async () => {
    onRefresh(() => v1ok(v1LoginResult()))
    server.use(
      mswHttp.post(`${V1_BASE}/auth/login`, () => v1error(401, 'SESSION_INVALID_CREDENTIALS')),
    )
    await expect(v1Post('/auth/login', { phoneNumber: 'x', password: 'y' })).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(refreshCalls).toHaveLength(0)
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('chưa có phiên (không marker) → 401 chỉ reject, không refresh', async () => {
    clearCredentials()
    onRefresh(() => v1ok(v1LoginResult()))
    server.use(mswHttp.get(`${V1_BASE}/things`, () => v1error(401, 'SESSION_ACCESS_TOKEN_MISSING')))
    await expect(v1Get('/things')).rejects.toBeInstanceOf(ApiV1Error)
    expect(refreshCalls).toHaveLength(0)
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('đang khoá → 401 chỉ reject, không refresh (khoá không tự mở bằng refresh)', async () => {
    lockCredentials()
    onRefresh(() => v1ok(v1LoginResult()))
    server.use(mswHttp.get(`${V1_BASE}/things`, () => v1error(401, 'SESSION_ACCESS_TOKEN_MISSING')))
    await expect(apiV1Http.get('/things')).rejects.toBeInstanceOf(ApiV1Error)
    expect(refreshCalls).toHaveLength(0)
    expect(onSessionEnd).not.toHaveBeenCalled()
  })
})
