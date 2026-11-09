import { act, renderHook } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'

import { SHEET_CLOSE_DELAY_MS, useSheetSubmit } from './useSheetSubmit'

function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

describe('useSheetSubmit', () => {
  it('idle → busy → success: rung success, đóng sau đúng SHEET_CLOSE_DELAY_MS', async () => {
    const d = deferred()
    const onClose = jest.fn()
    const { result } = await renderHook(() =>
      useSheetSubmit({ onSubmit: () => d.promise, onClose, onError: jest.fn() }),
    )
    expect(result.current.doneState).toBe('idle')
    await act(async () => {
      void result.current.submit()
    })
    expect(result.current.doneState).toBe('busy')
    await act(async () => d.resolve())
    expect(result.current.doneState).toBe('success')
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success)
    await act(async () => jest.advanceTimersByTime(SHEET_CLOSE_DELAY_MS - 1))
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => jest.advanceTimersByTime(1))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('đang chạy → bấm thêm bị bỏ qua (khoá chống bấm đôi)', async () => {
    const d = deferred()
    const onSubmit = jest.fn(() => d.promise)
    const { result } = await renderHook(() =>
      useSheetSubmit({ onSubmit, onClose: jest.fn(), onError: jest.fn() }),
    )
    await act(async () => {
      void result.current.submit()
      void result.current.submit()
    })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await act(async () => d.resolve())
  })

  it('lỗi → rung error, mở khoá (idle), gọi onError, không đóng', async () => {
    const boom = new Error('boom')
    const onSubmit = jest.fn().mockRejectedValueOnce(boom).mockResolvedValueOnce(undefined)
    const onError = jest.fn()
    const onClose = jest.fn()
    const { result } = await renderHook(() => useSheetSubmit({ onSubmit, onClose, onError }))
    await act(() => result.current.submit())
    expect(onError).toHaveBeenCalledWith(boom)
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error)
    expect(result.current.doneState).toBe('idle')
    await act(async () => jest.advanceTimersByTime(1000))
    expect(onClose).not.toHaveBeenCalled()

    await act(() => result.current.submit())
    expect(onSubmit).toHaveBeenCalledTimes(2)
    expect(result.current.doneState).toBe('success')
  })

  it('unmount giữa chừng → xong cũng không rung, không hẹn giờ đóng', async () => {
    const d = deferred()
    const onClose = jest.fn()
    const { result, unmount } = await renderHook(() =>
      useSheetSubmit({ onSubmit: () => d.promise, onClose, onError: jest.fn() }),
    )
    await act(async () => {
      void result.current.submit()
    })
    await unmount()
    await act(async () => d.resolve())
    await act(async () => jest.advanceTimersByTime(1000))
    expect(onClose).not.toHaveBeenCalled()
    expect(Haptics.notificationAsync).not.toHaveBeenCalled()
  })

  it('unmount khi đang chờ đóng → huỷ hẹn giờ', async () => {
    const onClose = jest.fn()
    const { result, unmount } = await renderHook(() =>
      useSheetSubmit({ onSubmit: async () => {}, onClose, onError: jest.fn() }),
    )
    await act(() => result.current.submit())
    await unmount()
    await act(async () => jest.advanceTimersByTime(1000))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('lỗi sau khi unmount → vẫn báo onError (không nuốt lỗi) nhưng không rung', async () => {
    const d = deferred()
    const onError = jest.fn()
    const { result, unmount } = await renderHook(() =>
      useSheetSubmit({ onSubmit: () => d.promise, onClose: jest.fn(), onError }),
    )
    await act(async () => {
      void result.current.submit()
    })
    await unmount()
    await act(async () => d.reject(new Error('x')))
    expect(onError).toHaveBeenCalledTimes(1)
    expect(Haptics.notificationAsync).not.toHaveBeenCalled()
  })
})
