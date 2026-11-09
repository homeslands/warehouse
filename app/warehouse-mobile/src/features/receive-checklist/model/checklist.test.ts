import { filterLines, lineStatus, progress } from './checklist'
import { makeLine } from './fixtures'

describe('lineStatus', () => {
  it('dòng chưa chạm → unchecked', () => {
    expect(lineStatus(makeLine(1))).toBe('unchecked')
  })
  it('đã kiểm, số = base → match', () => {
    expect(lineStatus(makeLine(1, { checked: true }))).toBe('match')
  })
  it('số 48 khi base 50 → diff', () => {
    const l = makeLine(1, {
      checked: true,
      quantity: 48,
      base: { quantity: 50, expiryDate: null, note: null },
    })
    expect(lineStatus(l)).toBe('diff')
  })
  it('số 0 → zero (kể cả khi base khác)', () => {
    expect(lineStatus(makeLine(1, { checked: true, quantity: 0 }))).toBe('zero')
  })
  it('hạn hoặc ghi chú khác base → diff', () => {
    expect(lineStatus(makeLine(1, { checked: true, expiryDate: '2027-01-01' }))).toBe('diff')
    expect(lineStatus(makeLine(1, { checked: true, note: 'rách bao' }))).toBe('diff')
  })
  it('dòng thêm trên máy (base null) đã kiểm → diff', () => {
    expect(lineStatus(makeLine(1, { checked: true, base: null }))).toBe('diff')
  })
  it('12.3456781 vs 12.345678 coi như bằng', () => {
    const l = makeLine(1, {
      checked: true,
      quantity: 12.3456781,
      base: { quantity: 12.345678, expiryDate: null, note: null },
    })
    expect(lineStatus(l)).toBe('match')
  })
  it('chưa kiểm nhưng đã sửa số vẫn là unchecked', () => {
    expect(lineStatus(makeLine(1, { quantity: 3 }))).toBe('unchecked')
  })
})

describe('lineStatus — ignoreChecked (chỉ xem: không có dấu kiểm)', () => {
  const opts = { ignoreChecked: true }
  it('dòng chưa chạm → match (không có "chưa kiểm")', () => {
    expect(lineStatus(makeLine(1), opts)).toBe('match')
  })
  it('sửa số / hạn / ghi chú mà không đánh dấu → diff; số 0 → zero', () => {
    expect(lineStatus(makeLine(1, { quantity: 3 }), opts)).toBe('diff')
    expect(lineStatus(makeLine(1, { expiryDate: '2027-01-01' }), opts)).toBe('diff')
    expect(lineStatus(makeLine(1, { note: 'rách bao' }), opts)).toBe('diff')
    expect(lineStatus(makeLine(1, { quantity: 0 }), opts)).toBe('zero')
  })
  it('dòng thêm → diff', () => {
    expect(lineStatus(makeLine(1, { base: null }), opts)).toBe('diff')
  })
  it('dấu đã kiểm không đổi kết quả', () => {
    const l = makeLine(1, { quantity: 3 })
    expect(lineStatus({ ...l, checked: true }, opts)).toBe(lineStatus(l, opts))
  })
})

// Mockup: 12 dòng, 7 đã kiểm, 1 lệch.
const mockup = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1
  if (n === 1) {
    return makeLine(n, {
      checked: true,
      quantity: 48,
      base: { quantity: 50, expiryDate: null, note: null },
    })
  }
  return makeLine(n, { checked: n <= 7 })
})

describe('progress', () => {
  it('đếm trên 12 dòng mockup', () => {
    expect(progress(mockup)).toEqual({ checked: 7, total: 12, diff: 1, zero: 0, unchecked: 5 })
  })
  it('đếm dòng zero', () => {
    const lines = [makeLine(1, { checked: true, quantity: 0 }), makeLine(2)]
    expect(progress(lines)).toEqual({ checked: 1, total: 2, diff: 0, zero: 1, unchecked: 1 })
  })
})

describe('filterLines', () => {
  it('all giữ nguyên', () => {
    expect(filterLines(mockup, 'all')).toHaveLength(12)
  })
  it('unchecked → đúng 5 dòng', () => {
    expect(filterLines(mockup, 'unchecked')).toHaveLength(5)
  })
  it('diff gồm dòng lệch', () => {
    expect(filterLines(mockup, 'diff').map((l) => l.key)).toEqual(['m-1|u-1'])
  })
})

describe('dòng thêm trên máy (phiếu đã có trên server) là lệch', () => {
  const added = (n: number, over = {}) => makeLine(n, { base: null, ...over })
  it('đã kiểm → diff; chưa kiểm → unchecked; số 0 → zero', () => {
    expect(lineStatus(added(1, { checked: true }))).toBe('diff')
    expect(lineStatus(added(1))).toBe('unchecked')
    expect(lineStatus(added(1, { checked: true, quantity: 0 }))).toBe('zero')
    expect(progress([added(1, { checked: true })]).diff).toBe(1)
  })
})

describe('filterLines — bốn ô lọc của màn phiếu', () => {
  const lines = [
    makeLine(1, { checked: true }), // khớp
    makeLine(2, { checked: true, quantity: 7 }), // lệch
    makeLine(3, { checked: true, quantity: 0 }), // không nhận
    makeLine(4), // chưa kiểm
  ]
  it('match → chỉ dòng khớp', () => {
    expect(filterLines(lines, 'match').map((l) => l.key)).toEqual(['m-1|u-1'])
  })
  it('diff → dòng lệch + dòng "Không nhận" (số 0)', () => {
    expect(filterLines(lines, 'diff').map((l) => l.key)).toEqual(['m-2|u-2', 'm-3|u-3'])
  })
  it('unchecked → chỉ dòng chưa kiểm', () => {
    expect(filterLines(lines, 'unchecked').map((l) => l.key)).toEqual(['m-4|u-4'])
  })
  it('dòng thêm đã kiểm nằm ở "diff", không ở "match"', () => {
    const added = [makeLine(1, { base: null, checked: true })]
    expect(filterLines(added, 'match')).toHaveLength(0)
    expect(filterLines(added, 'diff')).toHaveLength(1)
  })
})
