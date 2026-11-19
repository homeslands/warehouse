import { renderHook } from '@testing-library/react-native'

import { useRoutePreset } from './useRoutePreset'

const mockNavigation = { setParams: jest.fn() }
const mockParams: { current: Record<string, string | string[] | undefined> } = { current: {} }
jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  useLocalSearchParams: () => mockParams.current,
}))

const ALLOWED = ['DRAFT', 'PENDING'] as const
const apply = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockParams.current = {}
})

describe('useRoutePreset', () => {
  it('preset hợp lệ → apply đúng một lần rồi xoá param', async () => {
    mockParams.current = { preset: 'DRAFT' }
    await renderHook(() => useRoutePreset(ALLOWED, apply))
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith('DRAFT')
    expect(mockNavigation.setParams).toHaveBeenCalledWith({ preset: undefined })
  })

  it('rerender với cùng param (chưa kịp xoá) → không apply lại', async () => {
    mockParams.current = { preset: 'PENDING' }
    const { rerender } = await renderHook(() => useRoutePreset(ALLOWED, apply))
    await rerender({})
    await rerender({})
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('param đã xoá rồi được đặt lại (chạm lần nữa từ Tổng quan) → apply lại', async () => {
    mockParams.current = { preset: 'DRAFT' }
    const { rerender } = await renderHook(() => useRoutePreset(ALLOWED, apply))
    mockParams.current = {}
    await rerender({})
    mockParams.current = { preset: 'DRAFT' }
    await rerender({})
    expect(apply).toHaveBeenCalledTimes(2)
  })

  it('preset lạ → không apply, vẫn xoá param', async () => {
    mockParams.current = { preset: 'xyz' }
    await renderHook(() => useRoutePreset(ALLOWED, apply))
    expect(apply).not.toHaveBeenCalled()
    expect(mockNavigation.setParams).toHaveBeenCalledWith({ preset: undefined })
  })

  it('preset dạng mảng (?preset=a&preset=b) → không apply, vẫn xoá param', async () => {
    mockParams.current = { preset: ['DRAFT', 'PENDING'] }
    await renderHook(() => useRoutePreset(ALLOWED, apply))
    expect(apply).not.toHaveBeenCalled()
    expect(mockNavigation.setParams).toHaveBeenCalledWith({ preset: undefined })
  })

  it('không có param → không làm gì', async () => {
    await renderHook(() => useRoutePreset(ALLOWED, apply))
    expect(apply).not.toHaveBeenCalled()
    expect(mockNavigation.setParams).not.toHaveBeenCalled()
  })
})
