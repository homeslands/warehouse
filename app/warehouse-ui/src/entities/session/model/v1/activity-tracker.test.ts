import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVITY_REPORT_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  startActivityTracker,
} from './activity-tracker'

let report: ReturnType<typeof vi.fn<() => Promise<unknown>>>
let onIdle: ReturnType<typeof vi.fn<() => void>>
let stop: () => void

beforeEach(() => {
  vi.useFakeTimers()
  report = vi.fn<() => Promise<unknown>>(() => Promise.resolve())
  onIdle = vi.fn<() => void>()
  stop = startActivityTracker({ report, onIdle })
})

afterEach(() => {
  stop()
  vi.useRealTimers()
})

const MINUTE = 60_000

describe('activity tracker — business-rules §Auth/RBAC, D14 §2', () => {
  it('không tương tác 31 phút → KHÔNG gọi activity (timer không làm giả activity), khoá đúng mốc 30 phút', () => {
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(MINUTE)
    expect(report).not.toHaveBeenCalled()
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('polling/refresh (request API) không phải tương tác: không gia hạn idle', () => {
    // Mô phỏng polling: request chạy định kỳ không đi qua tracker → vẫn khoá đúng mốc.
    for (let i = 0; i < 30; i += 1) vi.advanceTimersByTime(MINUTE)
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(report).not.toHaveBeenCalled()
  })

  it('tương tác thật ĐẦU TIÊN sau khi khởi động được báo NGAY (review r1 M1), sau đó tối đa 1 lần mỗi khoảng', async () => {
    fireEvent.pointerDown(document.body)
    expect(report).toHaveBeenCalledTimes(1)

    // Gõ phím liên tục trong khoảng chờ: không gửi thêm.
    for (let i = 0; i < 50; i += 1) fireEvent.keyDown(document.body, { key: 'b' })
    await vi.advanceTimersByTimeAsync(ACTIVITY_REPORT_INTERVAL_MS - 1)
    fireEvent.pointerDown(document.body)
    expect(report).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(report).toHaveBeenCalledTimes(2)
  })

  it('restore sau reload / tab mới gần mốc idle: thao tác ngay sau khi khởi động vẫn được báo (không chờ 60 giây)', () => {
    // Kịch bản review M1: lần báo cuối ở T0, đọc 29 phút, F5 → tracker mới khởi động.
    stop()
    vi.advanceTimersByTime(29 * MINUTE)
    stop = startActivityTracker({ report, onIdle })
    vi.advanceTimersByTime(5_000)
    fireEvent.keyDown(document.body, { key: 'x' })
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('tab khác vừa báo trong khoảng (mốc chung) → tab này không báo trùng (review r1 L4)', () => {
    stop()
    let sharedAt: number | null = Date.now()
    stop = startActivityTracker({
      report,
      onIdle,
      shared: { read: () => sharedAt, write: (at) => (sharedAt = at) },
    })
    vi.advanceTimersByTime(10_000)
    fireEvent.pointerDown(document.body)
    expect(report).not.toHaveBeenCalled()
    vi.advanceTimersByTime(ACTIVITY_REPORT_INTERVAL_MS - 10_000)
    fireEvent.pointerDown(document.body)
    expect(report).toHaveBeenCalledTimes(1)
    expect(sharedAt).toBe(Date.now())
  })

  it('pointermove / scroll / wheel không tính là tương tác', () => {
    vi.advanceTimersByTime(ACTIVITY_REPORT_INTERVAL_MS)
    fireEvent.pointerMove(document.body)
    fireEvent.scroll(window)
    fireEvent.wheel(document.body)
    expect(report).not.toHaveBeenCalled()
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('tương tác dời mốc khoá: khoá 30 phút sau tương tác CUỐI', () => {
    vi.advanceTimersByTime(20 * MINUTE)
    fireEvent.keyDown(document.body, { key: 'x' })
    vi.advanceTimersByTime(29 * MINUTE)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(MINUTE)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('tương tác bị component chặn lan truyền vẫn được tính (listener capture)', () => {
    const button = document.createElement('button')
    button.addEventListener('pointerdown', (e) => e.stopPropagation())
    document.body.append(button)
    vi.advanceTimersByTime(ACTIVITY_REPORT_INTERVAL_MS)
    fireEvent.pointerDown(button)
    expect(report).toHaveBeenCalledTimes(1)
    button.remove()
  })

  it('activity lỗi (429/401) bị nuốt, không ném ra ngoài, lần sau vẫn theo khoảng', async () => {
    report.mockRejectedValueOnce(new Error('429'))
    fireEvent.keyDown(document.body, { key: 'a' })
    await vi.advanceTimersByTimeAsync(0)
    vi.advanceTimersByTime(ACTIVITY_REPORT_INTERVAL_MS)
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(report).toHaveBeenCalledTimes(2)
  })

  it('quay lại tab sau khi timer bị hãm: kiểm idle ngay khi visible', () => {
    // Timer bị hãm: thời gian thực trôi 31 phút nhưng setTimeout chưa chạy.
    vi.setSystemTime(Date.now() + 31 * MINUTE)
    expect(onIdle).not.toHaveBeenCalled()
    fireEvent(document, new Event('visibilitychange'))
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('dừng → gỡ listener và timer: không báo, không khoá', () => {
    stop()
    vi.advanceTimersByTime(ACTIVITY_REPORT_INTERVAL_MS)
    fireEvent.keyDown(document.body, { key: 'a' })
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS * 2)
    expect(report).not.toHaveBeenCalled()
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('idle là của phiên: tab khác vừa báo activity → tab này KHÔNG khoá; khoá khi mốc chung cũng quá 30 phút', () => {
    stop()
    let sharedAt: number | null = null
    const writes: number[] = []
    stop = startActivityTracker({
      report,
      onIdle,
      shared: {
        read: () => sharedAt,
        write: (at) => writes.push(at),
      },
    })
    // Tab khác báo activity ở phút 20 → tab này không khoá ở phút 30, khoá ở phút 50.
    vi.advanceTimersByTime(20 * MINUTE)
    sharedAt = Date.now()
    vi.advanceTimersByTime(10 * MINUTE)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20 * MINUTE - 1)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(writes).toEqual([])
  })

  it('tab này báo activity → ghi mốc chung cho tab khác', () => {
    stop()
    const writes: number[] = []
    stop = startActivityTracker({
      report,
      onIdle,
      shared: { read: () => null, write: (at) => writes.push(at) },
    })
    vi.advanceTimersByTime(ACTIVITY_REPORT_INTERVAL_MS)
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(writes).toEqual([Date.now()])
  })
})
