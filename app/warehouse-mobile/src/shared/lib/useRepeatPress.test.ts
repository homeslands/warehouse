import { act, renderHook } from '@testing-library/react-native'

import { useRepeatPress } from './useRepeatPress'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('useRepeatPress', () => {
  it('tap (onPress) steps exactly once, never repeats', async () => {
    const step = jest.fn()
    const { result } = await renderHook(() => useRepeatPress(step))
    await act(async () => result.current.onPress())
    expect(step).toHaveBeenCalledTimes(1)
    await act(async () => void jest.advanceTimersByTime(3000))
    expect(step).toHaveBeenCalledTimes(1)
  })

  it('long press after 400ms (delayLongPress) steps then repeats, accelerates, stops on press-out', async () => {
    const step = jest.fn()
    const { result } = await renderHook(() => useRepeatPress(step))
    expect(result.current.delayLongPress).toBe(400)
    await act(async () => result.current.onLongPress())
    expect(step).toHaveBeenCalledTimes(1)
    // 150ms then 127.5ms then ...
    await act(async () => void jest.advanceTimersByTime(149))
    expect(step).toHaveBeenCalledTimes(1)
    await act(async () => void jest.advanceTimersByTime(1))
    expect(step).toHaveBeenCalledTimes(2)
    await act(async () => void jest.advanceTimersByTime(127))
    expect(step).toHaveBeenCalledTimes(2)
    await act(async () => void jest.advanceTimersByTime(1))
    expect(step).toHaveBeenCalledTimes(3)
    // floor at 60ms
    await act(async () => void jest.advanceTimersByTime(3000))
    const before = step.mock.calls.length
    await act(async () => void jest.advanceTimersByTime(600))
    expect(step.mock.calls.length - before).toBe(10)
    await act(async () => result.current.onPressOut())
    const after = step.mock.calls.length
    await act(async () => void jest.advanceTimersByTime(2000))
    expect(step).toHaveBeenCalledTimes(after)
  })

  it('press-out alone (touch cancelled by a scroll) never steps', async () => {
    const step = jest.fn()
    const { result } = await renderHook(() => useRepeatPress(step))
    await act(async () => result.current.onPressOut())
    await act(async () => void jest.advanceTimersByTime(2000))
    expect(step).not.toHaveBeenCalled()
  })

  it('stops on unmount', async () => {
    const step = jest.fn()
    const { result, unmount } = await renderHook(() => useRepeatPress(step))
    await act(async () => result.current.onLongPress())
    await unmount()
    await act(async () => void jest.advanceTimersByTime(2000))
    expect(step).toHaveBeenCalledTimes(1)
  })

  it('disabled never steps', async () => {
    const step = jest.fn()
    const { result } = await renderHook(() => useRepeatPress(step, { disabled: true }))
    await act(async () => result.current.onPress())
    await act(async () => result.current.onLongPress())
    await act(async () => void jest.advanceTimersByTime(2000))
    expect(step).not.toHaveBeenCalled()
  })

  it('becoming disabled stops a running repeat', async () => {
    const step = jest.fn()
    const { result, rerender } = await renderHook(
      ({ disabled }: { disabled: boolean }) => useRepeatPress(step, { disabled }),
      { initialProps: { disabled: false } },
    )
    await act(async () => result.current.onLongPress())
    await rerender({ disabled: true })
    await act(async () => void jest.advanceTimersByTime(2000))
    expect(step).toHaveBeenCalledTimes(1)
  })

  it('uses the latest onStep', async () => {
    const a = jest.fn()
    const b = jest.fn()
    const { result, rerender } = await renderHook(({ f }: { f: () => void }) => useRepeatPress(f), {
      initialProps: { f: a },
    })
    await act(async () => result.current.onLongPress())
    await rerender({ f: b })
    await act(async () => void jest.advanceTimersByTime(150))
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('stops repeating when onStep returns false', async () => {
    let n = 0
    const step = jest.fn((): boolean => ++n < 3)
    const { result } = await renderHook(() => useRepeatPress(step))
    await act(async () => result.current.onLongPress())
    await act(async () => void jest.advanceTimersByTime(5000))
    expect(step).toHaveBeenCalledTimes(3)
  })

  it('does not arm timers when the first long-press step returns false', async () => {
    const step = jest.fn(() => false)
    const { result } = await renderHook(() => useRepeatPress(step))
    await act(async () => result.current.onLongPress())
    await act(async () => void jest.advanceTimersByTime(5000))
    expect(step).toHaveBeenCalledTimes(1)
  })
})
