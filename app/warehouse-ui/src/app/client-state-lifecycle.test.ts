import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { QueryClient } from '@tanstack/react-query'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  decideClientStatePurge,
  wireClientStateLifecycle,
  type AuthSnapshot,
} from '@/app/client-state-lifecycle'
import { makeStore, type AppStore } from '@/app/store'
import { useAuthStore, type CurrentUser } from '@/entities/session'
import { rootReducer } from '@/shared/store'

// Slice CHỈ dùng trong test (mock draft) — M01 chưa có slice thật.
const draftSlice = createSlice({
  name: 'testDraft',
  initialState: { note: '' },
  reducers: {
    setNote: (state, action: PayloadAction<string>) => {
      state.note = action.payload
    },
  },
})
const selectNote = rootReducer.inject(draftSlice).selector((s) => s.testDraft.note)

const userA: CurrentUser = { userSlug: 'a', userName: 'kho-a', roleName: 'ADMIN', scope: [] }
const userB: CurrentUser = { userSlug: 'b', userName: 'kho-b', roleName: 'ADMIN', scope: [] }
const TOKENS = { accessToken: 'acc', refreshToken: 'ref' }

describe('decideClientStatePurge', () => {
  const signedIn = (user: CurrentUser): AuthSnapshot => ({
    hasSession: true,
    user,
    endReason: null,
  })
  const ended = (endReason: AuthSnapshot['endReason']): AuthSnapshot => ({
    hasSession: false,
    user: null,
    endReason,
  })

  it.each(['loggedOut', 'revoked', 'userInactive'] as const)(
    'kết thúc phiên vì %s → purge',
    (r) => {
      expect(decideClientStatePurge('a', signedIn(userA), ended(r))).toEqual({
        owner: null,
        purge: true,
      })
    },
  )

  it.each(['expired', 'unauthorized'] as const)(
    'kết thúc phiên vì %s (khoá/hết hạn) → giữ',
    (r) => {
      expect(decideClientStatePurge('a', signedIn(userA), ended(r))).toEqual({
        owner: 'a',
        purge: false,
      })
    },
  )

  it('đăng nhập lại CÙNG user sau khi khoá → giữ', () => {
    const relogin = { hasSession: true, user: null, endReason: null }
    expect(decideClientStatePurge('a', relogin, signedIn({ ...userA }))).toEqual({
      owner: 'a',
      purge: false,
    })
  })

  it('đăng nhập bằng user KHÁC → purge, chủ mới là user đó', () => {
    const relogin = { hasSession: true, user: null, endReason: null }
    expect(decideClientStatePurge('a', relogin, signedIn(userB))).toEqual({
      owner: 'b',
      purge: true,
    })
  })

  it('lần đầu có user (chưa có chủ) → nhận chủ, không purge', () => {
    expect(decideClientStatePurge(null, ended(null), signedIn(userA))).toEqual({
      owner: 'a',
      purge: false,
    })
  })

  it('user không có userSlug (phiên cũ) → so theo userName', () => {
    const legacy = { userName: 'kho-a', roleName: 'ADMIN', scope: [] }
    expect(decideClientStatePurge('kho-a', ended('expired'), signedIn(legacy)).purge).toBe(false)
  })
})

describe('wireClientStateLifecycle (luồng thật qua useAuthStore)', () => {
  let store: AppStore
  let queryClient: QueryClient
  let unwire: () => void

  beforeEach(() => {
    useAuthStore.setState({
      hasSession: true,
      user: userA,
      status: 'authenticated',
      endReason: null,
    })
    store = makeStore()
    queryClient = new QueryClient()
    unwire = wireClientStateLifecycle({ queryClient, store })
    store.dispatch(draftSlice.actions.setNote('nháp của A'))
    queryClient.setQueryData(['probe'], 1)
  })

  afterEach(() => unwire())

  it('logout thật → purge Redux và xoá React Query', async () => {
    await act(() => useAuthStore.getState().logout())

    expect(selectNote(store.getState())).toBe('')
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('khoá/hết hạn rồi đăng nhập lại CÙNG user → draft Redux còn nguyên', () => {
    act(() => useAuthStore.getState().endSession('expired'))
    act(() => useAuthStore.getState().startSession(TOKENS))
    act(() => useAuthStore.getState().setUser({ ...userA }))

    expect(selectNote(store.getState())).toBe('nháp của A')
    // Server cache vẫn bị xoá như hành vi cũ — tải lại được, không phải draft.
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('khoá/hết hạn rồi đăng nhập bằng user KHÁC → purge Redux', () => {
    act(() => useAuthStore.getState().endSession('expired'))
    act(() => useAuthStore.getState().startSession(TOKENS))
    expect(selectNote(store.getState())).toBe('nháp của A')

    act(() => useAuthStore.getState().setUser(userB))

    expect(selectNote(store.getState())).toBe('')
  })

  it('gỡ wiring → không purge nữa', () => {
    unwire()
    act(() => useAuthStore.getState().endSession('loggedOut'))
    expect(selectNote(store.getState())).toBe('nháp của A')
  })
})
