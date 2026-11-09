import { renderHook } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { callsTo, ok, profile, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { clearTokens, setTokens } from '@/shared/api/token-storage'
import { useAuthStore } from './auth.store'
import type { CurrentUser } from './permissions'
import { useRefreshProfileOnForeground } from './useRefreshProfileOnForeground'

type Listener = (state: string) => void
let listeners: Listener[]
let remove: jest.Mock

const flush = () => jest.advanceTimersByTimeAsync(0)
const goActive = async () => {
  listeners.forEach((l) => l('background'))
  listeners.forEach((l) => l('active'))
  await flush()
}

beforeEach(() => {
  jest.useFakeTimers()
  resetFakeApi()
  clearTokens()
  setTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' })
  useAuthStore.setState({
    status: 'authenticated',
    user: profile({ scope: ['OLD'] }) as unknown as CurrentUser,
    endReason: null,
  })
  listeners = []
  remove = jest.fn()
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, l: Listener) => {
    listeners.push(l)
    return { remove }
  }) as never)
  route('get', '/auth/me', () => ok(profile({ scope: ['NEW'] })))
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('useRefreshProfileOnForeground', () => {
  it('background → active hai lần cách 10s chỉ gọi /auth/me 1 lần', async () => {
    await renderHook(() => useRefreshProfileOnForeground())
    await goActive()
    await jest.advanceTimersByTimeAsync(10_000)
    await goActive()
    expect(callsTo('get', '/auth/me')).toHaveLength(1)
  })

  it('cách 31s thì gọi 2 lần', async () => {
    await renderHook(() => useRefreshProfileOnForeground())
    await goActive()
    await jest.advanceTimersByTimeAsync(31_000)
    await goActive()
    expect(callsTo('get', '/auth/me')).toHaveLength(2)
  })

  it('scope mới được ghi vào store', async () => {
    await renderHook(() => useRefreshProfileOnForeground())
    await goActive()
    expect(useAuthStore.getState().user?.scope).toEqual(['NEW'])
  })

  it('chưa authenticated thì không gọi', async () => {
    useAuthStore.setState({ status: 'offline', user: null })
    await renderHook(() => useRefreshProfileOnForeground())
    await goActive()
    expect(callsTo('get', '/auth/me')).toHaveLength(0)
  })

  it('chuyển sang background/inactive không gọi', async () => {
    await renderHook(() => useRefreshProfileOnForeground())
    listeners.forEach((l) => l('inactive'))
    listeners.forEach((l) => l('background'))
    await flush()
    expect(callsTo('get', '/auth/me')).toHaveLength(0)
  })

  it('lỗi mạng không ném ra ngoài và không đổi trạng thái', async () => {
    route('get', '/auth/me', () => 'network')
    await renderHook(() => useRefreshProfileOnForeground())
    await goActive()
    expect(useAuthStore.getState().status).toBe('authenticated')
  })

  it('gỡ listener khi unmount', async () => {
    const { unmount } = await renderHook(() => useRefreshProfileOnForeground())
    await unmount()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
