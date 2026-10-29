import { describe, expect, it } from 'vitest'
import { toCreatedRange } from './date-range'

describe('toCreatedRange', () => {
  it('giữ nguyên khoảng đúng chiều', () => {
    expect(toCreatedRange('2026-10-01', '2026-10-15')).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-15',
    })
  })

  it('đảo chỗ khi từ > đến', () => {
    expect(toCreatedRange('2026-10-15', '2026-10-01')).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-15',
    })
  })

  it('một đầu: chỉ giữ khoá có giá trị', () => {
    expect(toCreatedRange('2026-10-01', undefined)).toEqual({ startDate: '2026-10-01' })
    expect(toCreatedRange(undefined, '2026-10-15')).toEqual({ endDate: '2026-10-15' })
  })

  it('trống → không có khoá nào', () => {
    expect(toCreatedRange()).toEqual({})
    expect(toCreatedRange('', '')).toEqual({})
  })
})
