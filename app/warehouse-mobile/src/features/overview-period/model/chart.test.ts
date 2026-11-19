import { lastDays, niceMax, weekdayShort } from './chart'

describe('lastDays', () => {
  it('7 ngày, cũ → mới', () => {
    expect(lastDays(new Date(2026, 10, 11, 9), 7)).toEqual([
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
    ])
  })
  it('qua đầu tháng/năm', () => {
    const d = lastDays(new Date(2027, 0, 2), 7)
    expect(d[0]).toBe('2026-12-27')
    expect(d[6]).toBe('2027-01-02')
  })
  it('now khác nhau → danh sách khác', () => {
    expect(lastDays(new Date(2026, 10, 12), 7)[6]).toBe('2026-11-12')
  })
})

describe('weekdayShort', () => {
  it('vi', () => {
    expect(weekdayShort('2026-11-09', 'vi')).toBe('T2')
    expect(weekdayShort('2026-11-15', 'vi')).toBe('CN')
  })
  it('en', () => {
    expect(weekdayShort('2026-11-09', 'en')).toBe('Mon')
    expect(weekdayShort('2026-11-15', 'en')).toBe('Sun')
  })
})

describe('niceMax', () => {
  it('0 → max ≥ 1', () => {
    const r = niceMax(0)
    expect(r.max).toBe(1)
    expect(r.ticks[0]).toBe(0)
    expect(r.ticks[r.ticks.length - 1]).toBe(1)
  })
  it('7', () => {
    const r = niceMax(7)
    expect([8, 10]).toContain(r.max)
    expect(r.ticks[0]).toBe(0)
    expect(r.ticks[r.ticks.length - 1]).toBe(r.max)
    expect(r.ticks.length).toBeGreaterThanOrEqual(2)
    expect(r.ticks.length).toBeLessThanOrEqual(4)
  })
  it('23', () => expect([25, 30]).toContain(niceMax(23).max))
  it('luôn ≥ giá trị và ticks 2–4', () => {
    for (const m of [1, 2, 3, 4, 5, 6, 9, 11, 49, 100, 101, 999]) {
      const r = niceMax(m)
      expect(r.max).toBeGreaterThanOrEqual(m)
      expect(r.ticks.length).toBeGreaterThanOrEqual(2)
      expect(r.ticks.length).toBeLessThanOrEqual(4)
    }
  })
})
