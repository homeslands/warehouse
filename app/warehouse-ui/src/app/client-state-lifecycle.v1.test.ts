/**
 * Vòng đời client state cho phiên v1 (R2-1 review M01). Slice `testDraftV1Lifecycle` là MOCK draft;
 * API là MSW mock theo OpenAPI R2.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { QueryClient } from '@tanstack/react-query'
import { http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  decideV1ClientStatePurge,
  isPurgeReason,
  wireClientStateLifecycleV1,
  type V1AuthSnapshot,
} from '@/app/client-state-lifecycle'
import { makeStore, type AppStore } from '@/app/store'
import { endV1Session, injectSessionV1, lockV1, loginV1, logoutV1 } from '@/entities/session'
import { V1_SESSION_END_KEYS, clearCredentials } from '@/shared/api/v1'
import { rootReducer } from '@/shared/store'
import { V1_BASE, v1Action, v1LoginResult, v1User, v1ok } from '@/shared/test/api-v1'
import { server } from '@/shared/test/msw'

const draftSlice = createSlice({
  name: 'testDraftV1Lifecycle',
  initialState: { note: '' },
  reducers: {
    setNote: (state, action: PayloadAction<string>) => {
      state.note = action.payload
    },
  },
})
const selectNote = rootReducer.inject(draftSlice).selector((s) => s.testDraftV1Lifecycle.note)

describe('R2-1: bảng errorKey v1 → lý do → purge được quyết định CHỦ ĐỘNG', () => {
  it('mọi khoá trong V1_SESSION_END_KEYS có quyết định purge đã duyệt (thêm khoá mới → test đỏ cho tới khi cập nhật bảng)', () => {
    const decided = Object.fromEntries(
      [...V1_SESSION_END_KEYS].map(([key, reason]) => [
        key,
        { reason, purge: isPurgeReason(reason) },
      ]),
    )
    expect(decided).toEqual({
      SESSION_IDLE_EXPIRED: { reason: 'idle', purge: false },
      SESSION_LOCKED: { reason: 'locked', purge: false },
      SESSION_REVOKED: { reason: 'revoked', purge: true },
      SESSION_REFRESH_TOKEN_REUSED: { reason: 'revoked', purge: true },
      SESSION_USER_INACTIVE: { reason: 'userInactive', purge: true },
      SESSION_EXPIRED: { reason: 'expired', purge: false },
    })
  })

  it('nhánh legacy giữ nguyên: loggedOut/revoked/userInactive purge; expired/unauthorized giữ', () => {
    expect((['loggedOut', 'revoked', 'userInactive'] as const).every(isPurgeReason)).toBe(true)
    expect(isPurgeReason('expired')).toBe(false)
    expect(isPurgeReason('unauthorized')).toBe(false)
  })
})

describe('decideV1ClientStatePurge', () => {
  const auth = (id: string): V1AuthSnapshot => ({
    status: 'authenticated',
    identityId: id,
    endReason: null,
  })
  const locked = (id: string | null, endReason: 'idle' | 'locked' = 'idle'): V1AuthSnapshot => ({
    status: 'locked',
    identityId: id,
    endReason,
  })
  const anon = (endReason: V1AuthSnapshot['endReason']): V1AuthSnapshot => ({
    status: 'anonymous',
    identityId: null,
    endReason,
  })

  it.each(['loggedOut', 'revoked', 'userInactive'] as const)(
    'authenticated → anonymous(%s) → purge',
    (r) => {
      expect(decideV1ClientStatePurge('a', auth('a'), anon(r))).toEqual({
        owner: null,
        purge: true,
        clearQueries: true,
      })
    },
  )

  it.each(['expired', 'unauthorized'] as const)(
    'authenticated → anonymous(%s) → giữ draft',
    (r) => {
      expect(decideV1ClientStatePurge('a', auth('a'), anon(r))).toEqual({
        owner: 'a',
        purge: false,
        clearQueries: true,
      })
    },
  )

  it.each(['idle', 'locked'] as const)('authenticated → locked(%s) → giữ draft (UI-02)', (r) => {
    expect(decideV1ClientStatePurge('a', auth('a'), locked('a', r))).toEqual({
      owner: 'a',
      purge: false,
      clearQueries: true,
    })
  })

  it('locked(a) → mở khoá cùng user → giữ', () => {
    expect(decideV1ClientStatePurge('a', locked('a'), auth('a'))).toEqual({
      owner: 'a',
      purge: false,
      clearQueries: true,
    })
  })

  it('locked(a) → mở khoá bằng user khác → purge, chủ mới là b', () => {
    expect(decideV1ClientStatePurge('a', locked('a'), auth('b'))).toEqual({
      owner: 'b',
      purge: true,
      clearQueries: true,
    })
  })

  it('locked → logout từ màn khoá → purge', () => {
    expect(decideV1ClientStatePurge('a', locked('a'), anon('loggedOut'))).toMatchObject({
      purge: true,
    })
  })

  it('khôi phục sau reload (unknown → authenticated) lần đầu nhận chủ → không purge', () => {
    const unknown: V1AuthSnapshot = { status: 'unknown', identityId: null, endReason: null }
    expect(decideV1ClientStatePurge(null, unknown, auth('a'))).toEqual({
      owner: 'a',
      purge: false,
      clearQueries: true,
    })
  })

  it('refresh đổi danh tính trong lúc authenticated (tab khác đăng nhập user khác) → purge', () => {
    expect(decideV1ClientStatePurge('a', auth('a'), auth('b'))).toEqual({
      owner: 'b',
      purge: true,
      clearQueries: false,
    })
  })
})

describe('wireClientStateLifecycleV1 (store thật + thunk thật, API mock)', () => {
  let store: AppStore
  let queryClient: QueryClient
  let unwire: () => void

  beforeEach(() => {
    injectSessionV1()
    store = makeStore()
    queryClient = new QueryClient()
    unwire = wireClientStateLifecycleV1({ queryClient, store })
  })

  afterEach(() => {
    unwire()
    clearCredentials()
  })

  async function login(userId: string) {
    server.use(
      mswHttp.post(`${V1_BASE}/auth/login`, () =>
        v1ok(v1LoginResult({ user: v1User({ id: userId }) })),
      ),
    )
    await store.dispatch(loginV1({ phoneNumber: '0900000001', password: 'p' }))
  }

  it('idle → mở khoá cùng user: draft còn nguyên; React Query bị xoá', async () => {
    await login('user-a')
    store.dispatch(draftSlice.actions.setNote('nháp của A'))
    queryClient.setQueryData(['x'], 1)

    store.dispatch(endV1Session('idle'))
    expect(queryClient.getQueryData(['x'])).toBeUndefined()
    await login('user-a')

    expect(selectNote(store.getState())).toBe('nháp của A')
  })

  it('lock → mở khoá bằng user khác: purge draft', async () => {
    await login('user-a')
    store.dispatch(draftSlice.actions.setNote('nháp của A'))
    server.use(mswHttp.post(`${V1_BASE}/auth/lock`, () => v1ok(v1Action('LOCKED'))))
    await store.dispatch(lockV1())
    expect(selectNote(store.getState())).toBe('nháp của A')

    await login('user-b')
    expect(selectNote(store.getState())).toBe('')
  })

  it('logout: purge draft, phiên về anonymous "loggedOut" (slice phiên không bị purge cuốn theo)', async () => {
    await login('user-a')
    store.dispatch(draftSlice.actions.setNote('nháp của A'))
    server.use(mswHttp.post(`${V1_BASE}/auth/logout`, () => v1ok(v1Action('REVOKED'))))
    await store.dispatch(logoutV1())
    expect(selectNote(store.getState())).toBe('')
    expect(store.getState().sessionV1).toMatchObject({
      status: 'anonymous',
      endReason: 'loggedOut',
    })
  })

  it('phiên bị thu hồi (revoked) → purge', async () => {
    await login('user-a')
    store.dispatch(draftSlice.actions.setNote('nháp'))
    store.dispatch(endV1Session('revoked'))
    expect(selectNote(store.getState())).toBe('')
  })

  it('gỡ wiring → không purge nữa', async () => {
    await login('user-a')
    store.dispatch(draftSlice.actions.setNote('nháp'))
    unwire()
    store.dispatch(endV1Session('loggedOut'))
    expect(selectNote(store.getState())).toBe('nháp')
  })
})
