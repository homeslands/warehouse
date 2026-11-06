/**
 * Wiring phiên v1 (bootstrap khi cờ bật) + đồng bộ nhiều tab. API là MSW MOCK (OpenAPI R2).
 */
import { QueryClient } from '@tanstack/react-query'
import { http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { syncV1SessionFromOtherTab, wireSessionV1 } from '@/app/session-v1'
import { makeStore, type AppStore } from '@/app/store'
import { injectSessionV1, loginV1, selectSessionV1 } from '@/entities/session'
import {
  V1_SESSION_STORAGE_KEY,
  clearCredentials,
  getAccessToken,
  readPersistedSession,
  v1Get,
} from '@/shared/api/v1'
import { V1_BASE, v1LoginResult, v1User, v1error, v1ok } from '@/shared/test/api-v1'
import { server } from '@/shared/test/msw'

let store: AppStore
let unwire: (() => void) | undefined
const session = () => selectSessionV1(store.getState())

beforeEach(() => {
  injectSessionV1()
  store = makeStore()
})

afterEach(() => {
  unwire?.()
  unwire = undefined
  clearCredentials()
})

async function login(userId = 'user-a') {
  server.use(
    mswHttp.post(`${V1_BASE}/auth/login`, () =>
      v1ok(v1LoginResult({ accessToken: 'access-a', user: v1User({ id: userId }) })),
    ),
  )
  await store.dispatch(loginV1({ phoneNumber: '0900000001', password: 'p' }))
}

/** Mô phỏng tab khác ghi localStorage: `storage` chỉ bắn ở tab KHÔNG ghi. */
function otherTabWrites(value: string | null) {
  if (value === null) localStorage.removeItem(V1_SESSION_STORAGE_KEY)
  else localStorage.setItem(V1_SESSION_STORAGE_KEY, value)
  window.dispatchEvent(
    new StorageEvent('storage', { key: V1_SESSION_STORAGE_KEY, newValue: value }),
  )
}

describe('wireSessionV1', () => {
  it('không có dấu vết phiên → anonymous, không request nào', async () => {
    unwire = wireSessionV1({ queryClient: new QueryClient(), store })
    await expect.poll(() => session().status).toBe('anonymous')
  })

  it('401 SESSION_IDLE_EXPIRED từ API (polling) → slice locked qua hook onSessionEnd', async () => {
    unwire = wireSessionV1({ queryClient: new QueryClient(), store })
    await expect.poll(() => session().status).toBe('anonymous')
    await login()
    server.use(mswHttp.get(`${V1_BASE}/poll`, () => v1error(401, 'SESSION_IDLE_EXPIRED')))
    await expect(v1Get('/poll')).rejects.toBeDefined()
    expect(session()).toMatchObject({ status: 'locked', endReason: 'idle' })
    expect(getAccessToken()).toBeNull()
  })

  it('refresh rotation đổi danh tính (tab khác đăng nhập user khác) → slice nhận danh tính mới', async () => {
    unwire = wireSessionV1({ queryClient: new QueryClient(), store })
    await expect.poll(() => session().status).toBe('anonymous')
    await login('user-a')
    server.use(
      mswHttp.get(`${V1_BASE}/things`, ({ request }) =>
        request.headers.get('Authorization') === 'Bearer access-a'
          ? v1error(401, 'SESSION_ACCESS_TOKEN_EXPIRED')
          : v1ok(1),
      ),
      mswHttp.post(`${V1_BASE}/auth/refresh`, () =>
        v1ok(v1LoginResult({ accessToken: 'access-b', user: v1User({ id: 'user-b' }) })),
      ),
    )
    await v1Get('/things')
    expect(session().identity?.id).toBe('user-b')
  })
})

describe('syncV1SessionFromOtherTab (D14 §2: đồng bộ khoá/đăng xuất nhiều tab)', () => {
  beforeEach(async () => {
    unwire = wireSessionV1({ queryClient: new QueryClient(), store })
    await expect.poll(() => session().status).toBe('anonymous')
    await login()
  })

  it('tab khác khoá → tab này khoá (bỏ access token)', () => {
    const current = readPersistedSession()
    otherTabWrites(JSON.stringify({ ...current, locked: true }))
    expect(session()).toMatchObject({ status: 'locked', endReason: 'locked' })
    expect(getAccessToken()).toBeNull()
  })

  it('tab khác đăng xuất → tab này đăng xuất (purge)', () => {
    otherTabWrites(null)
    expect(session()).toMatchObject({ status: 'anonymous', endReason: 'loggedOut' })
  })

  it('tab khác mở khoá (phiên mới) khi tab này đang khoá → refresh lấy access của phiên mới', async () => {
    const current = readPersistedSession()
    otherTabWrites(JSON.stringify({ ...current, locked: true }))
    expect(session().status).toBe('locked')
    let csrf: string | null = null
    server.use(
      mswHttp.post(`${V1_BASE}/auth/refresh`, ({ request }) => {
        csrf = request.headers.get('X-CSRF-Token')
        return v1ok(v1LoginResult({ accessToken: 'access-unlocked' }))
      }),
    )
    otherTabWrites(
      JSON.stringify({ csrfToken: 'csrf-other-tab-0001', sessionId: 'new-session', locked: false }),
    )
    await expect.poll(() => session().status).toBe('authenticated')
    expect(csrf).toBe('csrf-other-tab-0001')
    expect(getAccessToken()).toBe('access-unlocked')
  })

  it('cùng phiên, không khoá (tab khác vừa rotate CSRF) → không làm gì', () => {
    const current = readPersistedSession()
    if (current === null) throw new Error('cần phiên đang lưu')
    const before = store.getState()
    syncV1SessionFromOtherTab(store, { ...current, csrfToken: 'csrf-rotated-00001' })
    expect(store.getState()).toBe(before)
  })
})
