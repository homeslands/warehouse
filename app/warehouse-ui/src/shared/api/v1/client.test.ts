/**
 * Client `/api/v1` với MSW — MOCK đúng hình dạng OpenAPI R2, không gọi API thật (BE #197 còn draft).
 */
import { http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionEndReason } from '@/shared/api/types'
import { V1_BASE, v1LoginResult, v1error, v1ok } from '@/shared/test/api-v1'
import { server } from '@/shared/test/msw'
import { V1_REFRESH_LOCK, apiV1Http, setV1SessionHooks, v1Get, v1Post } from './client'
import {
  clearCredentials,
  getAccessToken,
  markCredentialsLocked,
  readPersistedSession,
  setAccessToken,
  writePersistedSession,
} from './credentials'
import { ApiV1Error, V1NetworkError, V1ProtocolError } from './errors'
import { isLockReason } from './session-end'

const SESSION_ID = '33333333-3333-4333-8333-333333333333'
const INITIAL_CSRF = 'csrf-initial-000000'

let onSessionEnd: ReturnType<typeof vi.fn<(reason: SessionEndReason) => void>>
let refreshCalls: { csrf: string | null; credentials: RequestCredentials; auth: string | null }[]

beforeEach(() => {
  refreshCalls = []
  // Như handler thật (`endV1Session`): đổi credentials ĐỒNG BỘ.
  onSessionEnd = vi.fn<(reason: SessionEndReason) => void>((reason) => {
    if (isLockReason(reason)) markCredentialsLocked()
    else clearCredentials()
  })
  setV1SessionHooks({ onSessionEnd })
  writePersistedSession({ csrfToken: INITIAL_CSRF, sessionId: SESSION_ID, locked: false })
  setAccessToken('access-old')
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
  it('gắn Bearer từ memory, gửi credentials include, trả `result` của envelope', async () => {
    let credentials: RequestCredentials | undefined
    server.use(
      mswHttp.get(`${V1_BASE}/things`, ({ request }) => {
        credentials = request.credentials
        return v1ok({ auth: request.headers.get('Authorization') })
      }),
    )
    await expect(v1Get('/things')).resolves.toEqual({ auth: 'Bearer access-old' })
    expect(credentials).toBe('include')
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

describe('refresh qua cookie + X-CSRF-Token, single-flight', () => {
  it('3 request 401 cùng lúc → đúng 1 refresh (CSRF đang lưu, cookie include, KHÔNG Bearer); cả 3 gửi lại bằng token mới', async () => {
    const rotated = v1LoginResult({ accessToken: 'access-new', csrfToken: 'csrf-rotated-000001' })
    onRefresh(() => v1ok(rotated))
    const seen = protectedThings()

    const results = await Promise.all([v1Get('/things'), v1Get('/things'), v1Get('/things')])

    expect(results).toEqual(Array(3).fill({ by: 'Bearer access-new' }))
    expect(refreshCalls).toEqual([{ csrf: INITIAL_CSRF, credentials: 'include', auth: null }])
    expect(seen.filter((a) => a === 'Bearer access-new')).toHaveLength(3)
    // Rotation: CSRF mới thay bản cũ, access chỉ ở memory.
    expect(readPersistedSession()).toEqual({
      csrfToken: 'csrf-rotated-000001',
      sessionId: rotated.sessionId,
      locked: false,
    })
    expect(getAccessToken()).toBe('access-new')
    expect(JSON.stringify(localStorage)).not.toContain('access-new')
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('refresh 401 SESSION_IDLE_EXPIRED (polling không gia hạn idle) → onSessionEnd("idle") ĐÚNG 1 lần, không gửi lại', async () => {
    onRefresh(() => v1error(401, 'SESSION_IDLE_EXPIRED'))
    const seen = protectedThings()

    const settled = await Promise.allSettled([v1Get('/things'), v1Get('/things')])

    expect(settled.every((r) => r.status === 'rejected')).toBe(true)
    expect(refreshCalls).toHaveLength(1)
    expect(seen).toEqual(['Bearer access-old', 'Bearer access-old'])
    expect(onSessionEnd.mock.calls).toEqual([['idle']])
    expect(readPersistedSession()?.locked).toBe(true)
  })

  it('refresh 403 GATEWAY_CSRF_INVALID → onSessionEnd("unauthorized")', async () => {
    onRefresh(() => v1error(403, 'GATEWAY_CSRF_INVALID'))
    protectedThings()
    await expect(v1Get('/things')).rejects.toMatchObject({ statusCode: 401 })
    expect(onSessionEnd.mock.calls).toEqual([['unauthorized']])
    expect(readPersistedSession()).toBeNull()
  })

  it('refresh 401 SESSION_REFRESH_TOKEN_REUSED → onSessionEnd("revoked")', async () => {
    onRefresh(() => v1error(401, 'SESSION_REFRESH_TOKEN_REUSED'))
    protectedThings()
    await expect(v1Get('/things')).rejects.toBeInstanceOf(ApiV1Error)
    expect(onSessionEnd.mock.calls).toEqual([['revoked']])
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
    expect(readPersistedSession()?.csrfToken).toBe(INITIAL_CSRF)
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
    expect(readPersistedSession()?.csrfToken).toBe(INITIAL_CSRF)
    expect(getAccessToken()).toBe('access-old')
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
    expect(readPersistedSession()).toBeNull()
    expect(getAccessToken()).toBeNull()
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('refresh tuần tự giữa các tab qua Web Locks (tên lock chung)', async () => {
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task())
    vi.stubGlobal('navigator', { ...navigator, locks: { request } })
    onRefresh(() => v1ok(v1LoginResult({ accessToken: 'access-new' })))
    protectedThings()
    await v1Get('/things')
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]?.[0]).toBe(V1_REFRESH_LOCK)
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

  it('401 terminal SESSION_LOCKED → khoá ("locked"), giữ CSRF để tab khác biết đang khoá', async () => {
    protectedThings('SESSION_LOCKED')
    await expect(v1Get('/things')).rejects.toBeInstanceOf(ApiV1Error)
    expect(onSessionEnd.mock.calls).toEqual([['locked']])
    expect(readPersistedSession()).toMatchObject({ csrfToken: INITIAL_CSRF, locked: true })
    expect(getAccessToken()).toBeNull()
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

  it('chưa có phiên (không CSRF) → 401 chỉ reject, không refresh', async () => {
    clearCredentials()
    onRefresh(() => v1ok(v1LoginResult()))
    server.use(mswHttp.get(`${V1_BASE}/things`, () => v1error(401, 'SESSION_ACCESS_TOKEN_MISSING')))
    await expect(v1Get('/things')).rejects.toBeInstanceOf(ApiV1Error)
    expect(refreshCalls).toHaveLength(0)
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('đang khoá → 401 chỉ reject, không refresh (khoá không tự mở bằng refresh)', async () => {
    markCredentialsLocked()
    onRefresh(() => v1ok(v1LoginResult()))
    server.use(mswHttp.get(`${V1_BASE}/things`, () => v1error(401, 'SESSION_ACCESS_TOKEN_MISSING')))
    await expect(apiV1Http.get('/things')).rejects.toBeInstanceOf(ApiV1Error)
    expect(refreshCalls).toHaveLength(0)
    expect(onSessionEnd).not.toHaveBeenCalled()
  })
})
