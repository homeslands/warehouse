import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/shared/test/msw'
import { setSessionEndHandler } from '@/shared/api/http'
import { getTokens, setTokens } from '@/shared/api/token-storage'
import { useAuthStore } from './auth.store'
import { useSession } from './useSession'

const BASE = 'http://localhost:8085/api/v1'
const user = { userId: 'u1', userName: 'root', roleName: 'SUPER_ADMIN', scope: '[]' }

beforeEach(() => {
  // Như bootstrap.tsx thật.
  setSessionEndHandler((reason) => useAuthStore.getState().endSession(reason))
  useAuthStore.setState({
    hasSession: false,
    sessionEpoch: 0,
    user: null,
    status: 'loading',
    endReason: null,
  })
})

describe('useSession', () => {
  it('không có phiên → unauthenticated, không gọi /auth/me', async () => {
    let calls = 0
    server.use(
      mswHttp.get(`${BASE}/auth/me`, () => {
        calls += 1
        return HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: user })
      }),
    )

    renderHook(() => useSession())
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'))
    expect(calls).toBe(0)
  })

  it('phiên kết thúc trước khi /auth/me trả về → bỏ kết quả cũ, vẫn unauthenticated', async () => {
    setTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' })
    useAuthStore.setState({ hasSession: true })
    let meStarted!: () => void
    const started = new Promise<void>((resolve) => (meStarted = resolve))
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    let responded!: () => void
    const done = new Promise<void>((resolve) => (responded = resolve))
    server.use(
      mswHttp.get(`${BASE}/auth/me`, async () => {
        meStarted()
        await released
        queueMicrotask(responded)
        return HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: user })
      }),
    )

    renderHook(() => useSession())
    await started
    act(() => useAuthStore.getState().endSession('loggedOut'))
    release()
    await done
    // Chờ chuỗi then() của getData chạy xong.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', user: null })
  })

  it('có phiên → tải /auth/me → authenticated', async () => {
    setTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' })
    useAuthStore.setState({ hasSession: true })
    server.use(
      mswHttp.get(`${BASE}/auth/me`, () =>
        HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: user }),
      ),
    )

    renderHook(() => useSession())

    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'))
    expect(useAuthStore.getState().user).toEqual(user)
  })

  it('/auth/me lỗi mạng → unauthenticated nhưng GIỮ token', async () => {
    setTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' })
    useAuthStore.setState({ hasSession: true })
    server.use(mswHttp.get(`${BASE}/auth/me`, () => HttpResponse.error()))

    renderHook(() => useSession())

    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'))
    expect(getTokens()).not.toBeNull()
  })

  it('/auth/me 401 và refresh hết hạn → phiên kết thúc với lý do expired, token bị xoá', async () => {
    setTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' })
    useAuthStore.setState({ hasSession: true })
    server.use(
      mswHttp.get(`${BASE}/auth/me`, () =>
        HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      ),
      mswHttp.post(`${BASE}/auth/refresh`, () =>
        HttpResponse.json(
          { statusCode: 401, code: 100004, message: 'Refresh token has expired' },
          { status: 401 },
        ),
      ),
    )

    renderHook(() => useSession())

    await waitFor(() => expect(useAuthStore.getState().endReason).toBe('expired'))
    expect(getTokens()).toBeNull()
  })

  it('startSession lần nữa khi đã có phiên → tải lại /auth/me (nhờ sessionEpoch)', async () => {
    setTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' })
    useAuthStore.setState({ hasSession: true })
    let calls = 0
    server.use(
      mswHttp.get(`${BASE}/auth/me`, () => {
        calls += 1
        return HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: user })
      }),
    )

    renderHook(() => useSession())
    await waitFor(() => expect(calls).toBe(1))

    useAuthStore.getState().startSession({ accessToken: 'acc-2', refreshToken: 'ref-2' })
    await waitFor(() => expect(calls).toBe(2))
  })
})
