import { donutSlices, okPercent } from './donut'

describe('donutSlices', () => {
  it('4 đoạn đúng thứ tự, có khe, đoạn nhỏ được nâng tối thiểu', () => {
    const s = donutSlices({ out: 2, low: 6, high: 3, ok: 117 })
    expect(s.map((x) => x.key)).toEqual(['out', 'low', 'high', 'ok'])
    for (let i = 0; i < s.length; i++) {
      expect(s[i].end - s[i].start).toBeGreaterThanOrEqual(0.02 - 1e-9)
      if (i > 0) {
        expect(s[i].start).toBeGreaterThan(s[i - 1].start)
        expect(s[i].start - s[i - 1].end).toBeCloseTo(0.012, 9)
      }
    }
    expect(s[3].end).toBeLessThanOrEqual(1)
    expect(s[0].start).toBe(0)
  })

  it('bỏ đoạn 0', () => {
    const s = donutSlices({ out: 0, low: 1, high: 0, ok: 1 })
    expect(s.map((x) => x.key)).toEqual(['low', 'ok'])
  })

  it('một đoạn: đủ vòng, không khe', () => {
    expect(donutSlices({ out: 0, low: 0, high: 0, ok: 5 })).toEqual([
      { key: 'ok', value: 5, start: 0, end: 1 },
    ])
  })

  it('tất cả 0 → []', () => {
    expect(donutSlices({ out: 0, low: 0, high: 0, ok: 0 })).toEqual([])
  })

  it('không NaN với tỉ lệ cực lệch', () => {
    const s = donutSlices({ out: 1, low: 0, high: 0, ok: 100000 })
    for (const x of s) {
      expect(Number.isFinite(x.start)).toBe(true)
      expect(Number.isFinite(x.end)).toBe(true)
      expect(x.end - x.start).toBeGreaterThanOrEqual(0.02 - 1e-9)
    }
  })
})

describe('okPercent', () => {
  it('làm tròn xuống', () => expect(okPercent({ total: 128, ok: 117 })).toBe(91))
  it('999/1000 không thành 100%', () => expect(okPercent({ total: 1000, ok: 999 })).toBe(99))
  it('không lệch do số thực (29/100 → 29)', () =>
    expect(okPercent({ total: 100, ok: 29 })).toBe(29))
  it('tất cả ổn → 100', () => expect(okPercent({ total: 7, ok: 7 })).toBe(100))
  it('total 0 → null', () => expect(okPercent({ total: 0, ok: 0 })).toBeNull())
})
