import { expiryStatus, formatShortDate } from './expiry'

const today = new Date(2026, 10, 4, 15, 30)
const plus = (n: number) => {
  const d = new Date(2026, 10, 4 + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('expiryStatus', () => {
  it('null → none', () => {
    expect(expiryStatus(null, today)).toEqual({ kind: 'none', days: null })
  })
  it('hôm qua → expired', () => {
    expect(expiryStatus(plus(-1), today)).toEqual({ kind: 'expired', days: -1 })
  })
  it('hôm nay → soon, 0 ngày', () => {
    expect(expiryStatus(plus(0), today)).toEqual({ kind: 'soon', days: 0 })
  })
  it('còn 47 ngày → soon', () => {
    expect(expiryStatus(plus(47), today)).toEqual({ kind: 'soon', days: 47 })
  })
  it('còn 60 ngày → soon, 61 ngày → ok', () => {
    expect(expiryStatus(plus(60), today).kind).toBe('soon')
    expect(expiryStatus(plus(61), today)).toEqual({ kind: 'ok', days: 61 })
  })
})

describe('formatShortDate', () => {
  it('yyyy-MM-dd → dd/MM/yy (không lệch múi giờ)', () => {
    expect(formatShortDate('2026-09-20')).toBe('20/09/26')
    expect(formatShortDate('2027-01-05')).toBe('05/01/27')
  })
  it('chuỗi không phải ngày → trả nguyên văn', () => {
    expect(formatShortDate('abc')).toBe('abc')
  })
})
