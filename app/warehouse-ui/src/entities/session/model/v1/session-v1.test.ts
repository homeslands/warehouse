/**
 * Slice + thunk phiên v1 với MSW — MOCK đúng OpenAPI R2, không gọi API thật.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import { http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearCredentials,
  getAccessToken,
  readPersistedSession,
  V1_SESSION_STORAGE_KEY,
} from '@/shared/api/v1'
import { appReducer, purgeClientState, rootReducer } from '@/shared/store'
import { V1_BASE, v1Action, v1LoginResult, v1User, v1error, v1ok } from '@/shared/test/api-v1'
import { server } from '@/shared/test/msw'
import { injectSessionV1, selectSessionV1 } from './session-v1.slice'
import { lockV1, loginV1, logoutV1, restoreV1Session } from './session-v1.thunks'

function makeStore() {
  injectSessionV1()
  return configureStore({ reducer: appReducer })
}

let store: ReturnType<typeof makeStore>
const session = () => selectSessionV1(store.getState())

beforeEach(() => {
  store = makeStore()
})

afterEach(() => {
  clearCredentials()
})

describe('loginV1 (UI-01/UI-02)', () => {
  it('gửi body Login, lưu CSRF + sessionId, access CHỈ trong memory, không có refresh token ở storage', async () => {
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
    expect(readPersistedSession()).toEqual({
      csrfToken: 'csrf-login-000001',
      sessionId: result.sessionId,
      locked: false,
    })
    const stored = localStorage.getItem(V1_SESSION_STORAGE_KEY) ?? ''
    expect(stored).not.toContain('access-login')
    expect(stored.toLowerCase()).not.toContain('refresh')
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
    expect(readPersistedSession()).toBeNull()
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

  it('có CSRF → refresh bằng cookie → authenticated với danh tính từ LoginResult', async () => {
    localStorage.setItem(
      V1_SESSION_STORAGE_KEY,
      JSON.stringify({ csrfToken: 'csrf-saved-000000', sessionId: 's', locked: false }),
    )
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
    expect(csrf).toBe('csrf-saved-000000')
    expect(session()).toMatchObject({ status: 'authenticated', identity: { id: 'user-b' } })
    expect(getAccessToken()).toBe('access-restored')
  })

  it('refresh 401 SESSION_IDLE_EXPIRED → locked (UI-02)', async () => {
    localStorage.setItem(
      V1_SESSION_STORAGE_KEY,
      JSON.stringify({ csrfToken: 'csrf-saved-000000', sessionId: 's', locked: false }),
    )
    server.use(mswHttp.post(`${V1_BASE}/auth/refresh`, () => v1error(401, 'SESSION_IDLE_EXPIRED')))
    await store.dispatch(restoreV1Session())
    expect(session()).toMatchObject({ status: 'locked', endReason: 'idle' })
  })

  it('refresh 401 SESSION_REVOKED → anonymous "revoked", xoá CSRF', async () => {
    localStorage.setItem(
      V1_SESSION_STORAGE_KEY,
      JSON.stringify({ csrfToken: 'csrf-saved-000000', sessionId: 's', locked: false }),
    )
    server.use(mswHttp.post(`${V1_BASE}/auth/refresh`, () => v1error(401, 'SESSION_REVOKED')))
    await store.dispatch(restoreV1Session())
    expect(session()).toMatchObject({ status: 'anonymous', endReason: 'revoked' })
    expect(readPersistedSession()).toBeNull()
  })

  it('refresh lỗi mạng → anonymous nhưng GIỮ CSRF (F5 khi có mạng là vào lại)', async () => {
    localStorage.setItem(
      V1_SESSION_STORAGE_KEY,
      JSON.stringify({ csrfToken: 'csrf-saved-000000', sessionId: 's', locked: false }),
    )
    server.use(mswHttp.post(`${V1_BASE}/auth/refresh`, () => Response.error()))
    await store.dispatch(restoreV1Session())
    expect(session()).toMatchObject({ status: 'anonymous', endReason: null })
    expect(readPersistedSession()?.csrfToken).toBe('csrf-saved-000000')
  })

  it('đang khoá (tab khác khoá trước khi reload) → locked, không refresh', async () => {
    localStorage.setItem(
      V1_SESSION_STORAGE_KEY,
      JSON.stringify({ csrfToken: 'csrf-saved-000000', sessionId: 's', locked: true }),
    )
    let called = false
    server.use(
      mswHttp.post(`${V1_BASE}/auth/refresh`, () => {
        called = true
        return v1ok(v1LoginResult())
      }),
    )
    await store.dispatch(restoreV1Session())
    expect(session()).toMatchObject({ status: 'locked', endReason: 'locked' })
    expect(called).toBe(false)
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

describe('lockV1 (POST /auth/lock)', () => {
  it('khoá ở client NGAY rồi gửi lock bằng token đã giữ; access bỏ khỏi memory, giữ danh tính', async () => {
    await loggedIn()
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
    expect(readPersistedSession()?.locked).toBe(true)
    expect(session().identity?.phoneNumber).toBe('0900000001')
  })

  it('lock lỗi server → vẫn khoá ở client', async () => {
    await loggedIn()
    server.use(mswHttp.post(`${V1_BASE}/auth/lock`, () => v1error(500, 'GATEWAY_INTERNAL')))
    await store.dispatch(lockV1())
    expect(session().status).toBe('locked')
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
    expect(readPersistedSession()).toBeNull()
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
