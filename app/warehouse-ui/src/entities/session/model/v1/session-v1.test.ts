/**
 * Slice + thunk phiên v1 với MSW — MOCK đúng OpenAPI R2, không gọi API thật.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import { http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearCredentials,
  getAccessToken,
  readCsrfCookie,
  readSessionMarker,
  setV1SessionHooks,
  V1_SESSION_STORAGE_KEY,
} from '@/shared/api/v1'
import { appReducer, purgeClientState, rootReducer } from '@/shared/store'
import {
  V1_BASE,
  setCsrfCookie,
  setSessionMarker,
  v1Action,
  v1LoginResult,
  v1User,
  v1error,
  v1ok,
} from '@/shared/test/api-v1'
import { server } from '@/shared/test/msw'
import { injectSessionV1, selectSessionV1 } from './session-v1.slice'
import { endV1Session, lockV1, loginV1, logoutV1, restoreV1Session } from './session-v1.thunks'

function makeStore() {
  injectSessionV1()
  return configureStore({ reducer: appReducer })
}

let store: ReturnType<typeof makeStore>
const session = () => selectSessionV1(store.getState())

beforeEach(() => {
  store = makeStore()
  // Như `app/session-v1.ts`: client v1 báo kết thúc phiên → thunk thật.
  setV1SessionHooks({ onSessionEnd: (reason) => store.dispatch(endV1Session(reason)) })
})

afterEach(() => {
  setV1SessionHooks({ onSessionEnd: () => {} })
  clearCredentials()
})

describe('loginV1 (UI-01/UI-02)', () => {
  it('gửi body Login; access + CSRF CHỈ trong memory; localStorage chỉ có marker {sessionId, locked}', async () => {
    let body: unknown
    const result = v1LoginResult({ accessToken: 'access-login', csrfToken: 'csrf-login-000001' })
    server.use(
      mswHttp.post(`${V1_BASE}/auth/login`, async ({ request }) => {
        body = await request.json()
        return v1ok(result)
      }),
    )

    await store.dispatch(loginV1({ phoneNumber: '0900000001', password: 'secret-pass' }))

    expect(body).toEqual({ phoneNumber: '0900000001', password: 'secret-pass' })
    expect(session()).toEqual({
      status: 'authenticated',
      identity: { id: result.user.id, phoneNumber: '0900000001', displayName: 'Nguyễn Văn A' },
      sessionId: result.sessionId,
      endReason: null,
    })
    expect(getAccessToken()).toBe('access-login')
    expect(readSessionMarker()).toEqual({ sessionId: result.sessionId, locked: false })
    const stored = localStorage.getItem(V1_SESSION_STORAGE_KEY) ?? ''
    expect(JSON.parse(stored)).toEqual({ sessionId: result.sessionId, locked: false })
    expect(JSON.stringify(localStorage)).not.toContain('access-login')
    expect(JSON.stringify(localStorage)).not.toContain('csrf-login-000001')
  })

  it('401 → reject ApiV1Error, không tạo phiên', async () => {
    server.use(
      mswHttp.post(`${V1_BASE}/auth/login`, () => v1error(401, 'SESSION_INVALID_CREDENTIALS')),
    )
    await expect(
      store.dispatch(loginV1({ phoneNumber: 'x', password: 'y' })),
    ).rejects.toMatchObject({
      errorKey: 'SESSION_INVALID_CREDENTIALS',
    })
    expect(session().status).toBe('unknown')
    expect(readSessionMarker()).toBeNull()
  })
})

describe('restoreV1Session (reload trang)', () => {
  it('không có dấu vết phiên → anonymous, KHÔNG gọi refresh', async () => {
    let called = false
    server.use(
      mswHttp.post(`${V1_BASE}/auth/refresh`, () => {
        called = true
        return v1ok(v1LoginResult())
      }),
    )
    await store.dispatch(restoreV1Session())
    expect(session()).toMatchObject({ status: 'anonymous', endReason: null })
    expect(called).toBe(false)
  })

  it('reload: marker + cookie CSRF → refresh (cookie `wh_refresh` + CSRF từ cookie) → authenticated', async () => {
    setSessionMarker({ sessionId: 's', locked: false })
    setCsrfCookie('csrf-cookie-000000')
    let csrf: string | null = null
    server.use(
      mswHttp.post(`${V1_BASE}/auth/refresh`, ({ request }) => {
        csrf = request.headers.get('X-CSRF-Token')
        return v1ok(
          v1LoginResult({ accessToken: 'access-restored', user: v1User({ id: 'user-b' }) }),
        )
      }),
    )
    await store.dispatch(restoreV1Session())
    expect(csrf).toBe('csrf-cookie-000000')
    expect(session()).toMatchObject({ status: 'authenticated', identity: { id: 'user-b' } })
    expect(getAccessToken()).toBe('access-restored')
  })

  it('reload: marker nhưng KHÔNG có cookie CSRF (không fallback nguồn khác) → anonymous, không refresh', async () => {
    setSessionMarker({ sessionId: 's', locked: false })
    await store.dispatch(restoreV1Session())
    expect(session()).toMatchObject({ status: 'anonymous', endReason: null })
  })

  it('reload: cookie `__Host-wh_csrf` KHÔNG được đọc khi trang chạy HTTP (đúng một tên theo giao thức)', async () => {
    setSessionMarker({ sessionId: 's', locked: false })
    document.cookie = '__Host-wh_csrf=csrf-wrong-name; Path=/'
    await store.dispatch(restoreV1Session())
    expect(session().status).toBe('anonymous')
    document.cookie = '__Host-wh_csrf=; Path=/; Max-Age=0'
  })

  it('refresh 401 SESSION_IDLE_EXPIRED → locked (UI-02), xoá cookie CSRF', async () => {
    setSessionMarker({ sessionId: 's', locked: false })
    setCsrfCookie('csrf-cookie-000000')
    server.use(mswHttp.post(`${V1_BASE}/auth/refresh`, () => v1error(401, 'SESSION_IDLE_EXPIRED')))
    await store.dispatch(restoreV1Session())
    expect(session()).toMatchObject({ status: 'locked', endReason: 'idle' })
    expect(readCsrfCookie()).toBeNull()
  })

  it('refresh 401 SESSION_REVOKED → anonymous "revoked", xoá marker', async () => {
    setSessionMarker({ sessionId: 's', locked: false })
    setCsrfCookie('csrf-cookie-000000')
    server.use(mswHttp.post(`${V1_BASE}/auth/refresh`, () => v1error(401, 'SESSION_REVOKED')))
    await store.dispatch(restoreV1Session())
    expect(session()).toMatchObject({ status: 'anonymous', endReason: 'revoked' })
    expect(readSessionMarker()).toBeNull()
  })

  it('refresh lỗi mạng → anonymous nhưng GIỮ marker + cookie (F5 khi có mạng là vào lại)', async () => {
    setSessionMarker({ sessionId: 's', locked: false })
    setCsrfCookie('csrf-cookie-000000')
    server.use(mswHttp.post(`${V1_BASE}/auth/refresh`, () => Response.error()))
    await store.dispatch(restoreV1Session())
    expect(session()).toMatchObject({ status: 'anonymous', endReason: null })
    expect(readSessionMarker()).toEqual({ sessionId: 's', locked: false })
    expect(readCsrfCookie()).toBe('csrf-cookie-000000')
  })

  it('marker đang khoá (tab khác khoá trước khi reload) → locked, không refresh', async () => {
    setSessionMarker({ sessionId: 's', locked: true })
    setCsrfCookie('csrf-cookie-000000')
    // onUnhandledRequest: 'error' — gọi /auth/refresh ở đây sẽ làm test đỏ.
    await store.dispatch(restoreV1Session())
    expect(session()).toMatchObject({ status: 'locked', endReason: 'locked' })
  })
})

async function loggedIn() {
  server.use(
    mswHttp.post(`${V1_BASE}/auth/login`, () =>
      v1ok(v1LoginResult({ accessToken: 'access-live' })),
    ),
  )
  await store.dispatch(loginV1({ phoneNumber: '0900000001', password: 'p' }))
}

/** Sau khi khoá: mô phỏng kẻ có quyền truy cập máy sửa marker thành `locked: false` rồi F5. */
async function tamperMarkerAndReload() {
  const marker = readSessionMarker()
  if (marker === null) throw new Error('cần marker')
  setSessionMarker({ ...marker, locked: false })
  store = makeStore()
  // onUnhandledRequest: 'error' — nếu restore gọi /auth/refresh mà không có handler, test đỏ.
  await store.dispatch(restoreV1Session())
}

describe('lockV1 (POST /auth/lock) — review r1 M2', () => {
  it('che dữ liệu NGAY, gửi lock bằng Bearer; xong thì bỏ access + CSRF (memory + cookie), marker locked, giữ danh tính', async () => {
    await loggedIn()
    setCsrfCookie('csrf-cookie-live-00001')
    let auth: string | null = null
    server.use(
      mswHttp.post(`${V1_BASE}/auth/lock`, ({ request }) => {
        auth = request.headers.get('Authorization')
        return v1ok(v1Action('LOCKED'))
      }),
    )
    const pending = store.dispatch(lockV1())
    expect(session()).toMatchObject({ status: 'locked', endReason: 'locked' })
    await pending
    expect(auth).toBe('Bearer access-live')
    expect(getAccessToken()).toBeNull()
    expect(readCsrfCookie()).toBeNull()
    expect(readSessionMarker()?.locked).toBe(true)
    expect(session().identity?.phoneNumber).toBe('0900000001')
  })

  it('access token hết hạn (401) → refresh MỘT lần rồi gửi lock lại; sau đó vẫn bỏ credential', async () => {
    await loggedIn()
    const lockAuth: (string | null)[] = []
    server.use(
      mswHttp.post(`${V1_BASE}/auth/lock`, ({ request }) => {
        const auth = request.headers.get('Authorization')
        lockAuth.push(auth)
        return auth === 'Bearer access-live'
          ? v1error(401, 'SESSION_ACCESS_TOKEN_EXPIRED')
          : v1ok(v1Action('LOCKED'))
      }),
      mswHttp.post(`${V1_BASE}/auth/refresh`, () => {
        // Server rotate đặt cookie CSRF mới (MOCK) — phải bị xoá khi khoá xong.
        setCsrfCookie('csrf-after-refresh-001')
        return v1ok(v1LoginResult({ accessToken: 'access-refreshed' }))
      }),
    )
    await store.dispatch(lockV1())
    expect(lockAuth).toEqual(['Bearer access-live', 'Bearer access-refreshed'])
    expect(getAccessToken()).toBeNull()
    expect(readCsrfCookie()).toBeNull()
    expect(session().status).toBe('locked')
    await tamperMarkerAndReload()
    expect(session().status).toBe('anonymous')
  })

  it('lock lỗi mạng → vẫn khoá ở client; sửa marker rồi reload KHÔNG vào lại được (không còn CSRF) → phải login', async () => {
    await loggedIn()
    setCsrfCookie('csrf-cookie-live-00001')
    server.use(mswHttp.post(`${V1_BASE}/auth/lock`, () => Response.error()))
    await store.dispatch(lockV1())
    expect(session().status).toBe('locked')
    expect(readCsrfCookie()).toBeNull()

    await tamperMarkerAndReload()
    expect(session()).toMatchObject({ status: 'anonymous', endReason: null })
    expect(getAccessToken()).toBeNull()
  })

  it('lock lỗi server (500) → vẫn khoá ở client, không còn credential', async () => {
    await loggedIn()
    server.use(mswHttp.post(`${V1_BASE}/auth/lock`, () => v1error(500, 'GATEWAY_INTERNAL')))
    await store.dispatch(lockV1())
    expect(session().status).toBe('locked')
    expect(getAccessToken()).toBeNull()
  })

  it('lock nhận 401 SESSION_REVOKED (phiên đã bị thu hồi) → về anonymous "revoked", không tạo lại marker', async () => {
    await loggedIn()
    server.use(mswHttp.post(`${V1_BASE}/auth/lock`, () => v1error(401, 'SESSION_REVOKED')))
    await store.dispatch(lockV1())
    expect(session()).toMatchObject({ status: 'anonymous', endReason: 'revoked' })
    expect(readSessionMarker()).toBeNull()
  })
})

describe('logoutV1', () => {
  it('POST /auth/logout bằng Bearer rồi về anonymous "loggedOut", xoá credentials', async () => {
    await loggedIn()
    let auth: string | null = null
    server.use(
      mswHttp.post(`${V1_BASE}/auth/logout`, ({ request }) => {
        auth = request.headers.get('Authorization')
        return v1ok(v1Action('REVOKED'))
      }),
    )
    await store.dispatch(logoutV1())
    expect(auth).toBe('Bearer access-live')
    expect(session()).toEqual({
      status: 'anonymous',
      identity: null,
      sessionId: null,
      endReason: 'loggedOut',
    })
    expect(readSessionMarker()).toBeNull()
    expect(getAccessToken()).toBeNull()
  })

  it('logout lỗi → vẫn đăng xuất ở client', async () => {
    await loggedIn()
    server.use(mswHttp.post(`${V1_BASE}/auth/logout`, () => Response.error()))
    await store.dispatch(logoutV1())
    expect(session().status).toBe('anonymous')
  })

  it('đang khoá (không còn access token) → không gọi API, chỉ đăng xuất ở client', async () => {
    await loggedIn()
    server.use(mswHttp.post(`${V1_BASE}/auth/lock`, () => v1ok(v1Action())))
    await store.dispatch(lockV1())
    // onUnhandledRequest: 'error' — gọi /auth/logout ở đây sẽ làm test đỏ.
    await store.dispatch(logoutV1())
    expect(session().endReason).toBe('loggedOut')
  })
})

describe('purgeClientState giữ slice phiên', () => {
  it('purge đưa draft về đầu nhưng GIỮ sessionV1 (đầu vào của quyết định purge, lý do cho màn login)', async () => {
    const draft = createSlice({
      name: 'testDraftV1',
      initialState: { note: '' },
      reducers: { write: (s, { payload }: { payload: string }) => ({ ...s, note: payload }) },
    })
    rootReducer.inject(draft)
    await loggedIn()
    store.dispatch(draft.actions.write('nháp'))

    store.dispatch(purgeClientState())

    const state = store.getState() as unknown as { testDraftV1: { note: string } }
    expect(state.testDraftV1.note).toBe('')
    expect(session().status).toBe('authenticated')
  })
})
