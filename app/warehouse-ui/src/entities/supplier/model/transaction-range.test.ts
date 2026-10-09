import { describe, expect, it } from 'vitest'
import { toTransactionDate, toTransactionRange } from './transaction-range'

describe('toTransactionRange', () => {
  it('ngày đầu 00:00:00.000 và ngày cuối 23:59:59.999 GIỜ MÁY, gửi ISO', () => {
    const { from, to } = toTransactionRange('2026-10-01', '2026-10-07')
    expect(from).toBe(new Date(2026, 9, 1, 0, 0, 0, 0).toISOString())
    expect(to).toBe(new Date(2026, 9, 7, 23, 59, 59, 999).toISOString())
  })

  it('giao dịch 22:00 ngày cuối nằm trong khoảng', () => {
    const { to } = toTransactionRange(undefined, '2026-10-07')
    expect(new Date(2026, 9, 7, 22, 0).getTime()).toBeLessThanOrEqual(new Date(to!).getTime())
  })

  it('thiếu một đầu → chỉ đầu còn lại; trống cả hai → {}', () => {
    expect(toTransactionRange('2026-10-01')).toEqual({ from: new Date(2026, 9, 1).toISOString() })
    expect(toTransactionRange()).toEqual({})
  })

  it('ngày không hợp lệ bị bỏ qua', () => {
    expect(toTransactionRange('abc')).toEqual({})
  })
})

describe('toTransactionDate', () => {
  const now = new Date(2026, 9, 8, 15, 30)
  it('chọn hôm nay → thời điểm hiện tại', () => {
    expect(toTransactionDate('2026-10-08', now)).toBe(now.toISOString())
  })
  it('chọn ngày khác → 12:00 giờ máy của ngày đó (không lệch ngày vì múi giờ)', () => {
    expect(toTransactionDate('2026-10-01', now)).toBe(new Date(2026, 9, 1, 12, 0).toISOString())
  })
  it('ngày không hợp lệ → 12:00 giờ máy của ngày hiện tại', () => {
    expect(toTransactionDate('abc', now)).toBe(new Date(2026, 9, 8, 12, 0).toISOString())
  })
})
