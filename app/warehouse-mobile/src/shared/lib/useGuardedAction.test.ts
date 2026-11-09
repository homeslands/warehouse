import { act, renderHook } from '@testing-library/react-native'

import { useGuardedAction } from './useGuardedAction'

function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useGuardedAction', () => {
  it('đang chạy → gọi lần hai bị bỏ qua (khoá đồng bộ), pending = true', async () => {
    const d = deferred()
    const action = jest.fn(() => d.promise)
    const { result } = await renderHook(() => useGuardedAction(action, { onError: jest.fn() }))
    await act(async () => {
      void result.current.run()
      void result.current.run()
    })
    expect(action).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(true)
    await act(async () => d.resolve())
  })

  it('thành công → giữ khoá (pending) cho tới reset()', async () => {
    const action = jest.fn(async () => {})
    const { result } = await renderHook(() => useGuardedAction(action, { onError: jest.fn() }))
    await act(() => result.current.run())
    expect(result.current.pending).toBe(true)
    await act(() => result.current.run())
    expect(action).toHaveBeenCalledTimes(1)

    await act(async () => result.current.reset())
    expect(result.current.pending).toBe(false)
    await act(() => result.current.run())
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('thất bại → mở khoá, lưu lỗi, gọi onError; chạy lại được và xoá lỗi cũ', async () => {
    const boom = new Error('boom')
    const action = jest.fn().mockRejectedValueOnce(boom).mockResolvedValueOnce(undefined)
    const onError = jest.fn()
    const { result } = await renderHook(() => useGuardedAction(action, { onError }))
    await act(() => result.current.run('a'))
    expect(action).toHaveBeenCalledWith('a')
    expect(onError).toHaveBeenCalledWith(boom)
    expect(result.current.error).toBe(boom)
    expect(result.current.pending).toBe(false)

    await act(() => result.current.run('b'))
    expect(action).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
  })

  it('run() không bao giờ reject; true chỉ khi chạy và thành công', async () => {
    const failing = await renderHook(() =>
      useGuardedAction(() => Promise.reject(new Error('x')), { onError: jest.fn() }),
    )
    let outcome: boolean | undefined
    await act(async () => {
      outcome = await failing.result.current.run()
    })
    expect(outcome).toBe(false)

    const passing = await renderHook(() => useGuardedAction(async () => {}, { onError: jest.fn() }))
    await act(async () => {
      outcome = await passing.result.current.run()
    })
    expect(outcome).toBe(true)
    await act(async () => {
      outcome = await passing.result.current.run()
    })
    expect(outcome).toBe(false)
  })
})
