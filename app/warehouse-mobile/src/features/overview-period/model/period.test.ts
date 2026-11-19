import {
  bucketIndex,
  bucketize,
  highlight,
  periodLabel,
  periodRange,
  previousRange,
  type SlimForm,
} from './period'

const now = new Date(2026, 10, 12, 8, 45) // thứ Năm 12/11/2026

const form = (slug: string, at: Date, amount: number): SlimForm => ({
  slug,
  code: slug,
  createdAt: at.toISOString(),
  amount,
  party: null,
  kind: 'import',
})

describe('periodRange', () => {
  it('tháng hiện tại: mùng 1 → hôm nay, nhưng đủ 30 ngày bucket', () => {
    const r = periodRange('month', 0, now)
    expect(r).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-12', current: true })
    expect(r.buckets).toHaveLength(30)
    expect(r.buckets[0]).toBe('2026-11-01')
    expect(r.buckets[29]).toBe('2026-11-30')
  })
  it('tháng trước: cả tháng, không phải kỳ hiện tại', () => {
    expect(periodRange('month', 1, now)).toMatchObject({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      current: false,
      offset: 1,
    })
  })
  it('tuần hiện tại: T2 → hôm nay, 7 bucket T2..CN', () => {
    const r = periodRange('week', 0, now)
    expect(r).toMatchObject({ startDate: '2026-11-09', endDate: '2026-11-12' })
    expect(r.buckets).toHaveLength(7)
    expect(r.buckets[0]).toBe('2026-11-09')
    expect(r.buckets[6]).toBe('2026-11-15')
  })
  it('tuần trước: cả tuần', () => {
    expect(periodRange('week', 1, now)).toMatchObject({
      startDate: '2026-11-02',
      endDate: '2026-11-08',
    })
  })
  it('Chủ nhật vẫn thuộc tuần bắt đầu thứ Hai trước đó', () => {
    expect(periodRange('week', 0, new Date(2026, 10, 15, 9)).startDate).toBe('2026-11-09')
  })
  it('ngày: 24 bucket giờ', () => {
    const r = periodRange('day', 0, now)
    expect(r).toMatchObject({ startDate: '2026-11-12', endDate: '2026-11-12' })
    expect(r.buckets).toHaveLength(24)
    expect(r.buckets[0]).toBe('00')
    expect(r.buckets[23]).toBe('23')
    expect(periodRange('day', 2, now).startDate).toBe('2026-11-10')
  })
  it('năm: 1/1 → hôm nay, 12 bucket tháng', () => {
    const r = periodRange('year', 0, now)
    expect(r).toMatchObject({ startDate: '2026-01-01', endDate: '2026-11-12' })
    expect(r.buckets).toHaveLength(12)
    expect(r.buckets[0]).toBe('2026-01')
    expect(periodRange('year', 1, now)).toMatchObject({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    })
  })
})

describe('previousRange', () => {
  it('tháng: tới cùng ngày, cutoff cùng giờ', () => {
    const p = previousRange(periodRange('month', 0, now), now)
    expect(p).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-12', offset: 1 })
    expect(p.current).toBe(false)
    expect(p.cutoff).toEqual(new Date(2026, 9, 12, 8, 45))
    expect(p.buckets).toHaveLength(31)
  })
  it('31/3 so với tháng 2: kẹp về 28 (lấy hết ngày 28)', () => {
    const n = new Date(2026, 2, 31)
    const p = previousRange(periodRange('month', 0, n), n)
    expect(p).toMatchObject({ startDate: '2026-02-01', endDate: '2026-02-28' })
    expect(p.cutoff?.getDate()).toBe(28)
    expect(p.cutoff?.getHours()).toBe(23)
  })
  it('tuần ở thứ Năm so tuần trước tới thứ Năm', () => {
    const p = previousRange(periodRange('week', 0, now), now)
    expect(p).toMatchObject({ startDate: '2026-11-02', endDate: '2026-11-05' })
    expect(p.cutoff).toEqual(new Date(2026, 10, 5, 8, 45))
  })
  it('ngày: hôm qua tới cùng giờ', () => {
    const p = previousRange(periodRange('day', 0, now), now)
    expect(p).toMatchObject({ startDate: '2026-11-11', endDate: '2026-11-11' })
    expect(p.cutoff).toEqual(new Date(2026, 10, 11, 8, 45))
  })
  it('năm: 2025 tới 12/11', () => {
    const p = previousRange(periodRange('year', 0, now), now)
    expect(p).toMatchObject({ startDate: '2025-01-01', endDate: '2025-11-12' })
  })
  it('29/2 năm nhuận so với năm không nhuận: kẹp 28/2', () => {
    const n = new Date(2028, 1, 29, 10)
    expect(previousRange(periodRange('year', 0, n), n).endDate).toBe('2027-02-28')
  })
  it('kỳ đã qua: so với cả kỳ trước, không cutoff', () => {
    const p = previousRange(periodRange('month', 1, now), now)
    expect(p).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-30' })
    expect(p.cutoff).toBeUndefined()
  })
})

describe('bucketize', () => {
  const forms = [
    form('a', new Date(2026, 10, 1, 10), 10),
    form('b', new Date(2026, 10, 1, 15), 20),
    form('c', new Date(2026, 10, 6, 9), 30),
  ]
  it('tháng: theo ngày', () => {
    const r = bucketize(forms, periodRange('month', 0, now))
    expect(r.amount[0]).toBe(30)
    expect(r.count[0]).toBe(2)
    expect(r.amount[5]).toBe(30)
    expect(r.count[5]).toBe(1)
    expect(r.amount.reduce((a, b) => a + b, 0)).toBe(60)
  })
  it('ngày: theo giờ, bỏ phiếu ngày khác', () => {
    const r = bucketize(
      [form('x', new Date(2026, 10, 12, 7, 30), 5), form('y', new Date(2026, 10, 11, 7), 9)],
      periodRange('day', 0, now),
    )
    expect(r.amount[7]).toBe(5)
    expect(r.amount.reduce((a, b) => a + b, 0)).toBe(5)
  })
  it('năm: theo tháng', () => {
    const r = bucketize(forms, periodRange('year', 0, now))
    expect(r.amount[10]).toBe(60)
    expect(r.count[10]).toBe(3)
  })
  it('phiếu sau cutoff bị bỏ', () => {
    const prev = previousRange(periodRange('day', 0, now), now) // hôm qua tới 08:45
    const r = bucketize(
      [form('x', new Date(2026, 10, 11, 8, 30), 5), form('y', new Date(2026, 10, 11, 9, 30), 7)],
      prev,
    )
    expect(r.amount.reduce((a, b) => a + b, 0)).toBe(5)
  })
})

describe('bucketIndex', () => {
  it('chỉ số ô của phiếu; ngoài kỳ / ngày hỏng / sau cutoff → -1', () => {
    const month = periodRange('month', 0, now)
    expect(bucketIndex(new Date(2026, 10, 6, 9).toISOString(), month)).toBe(5)
    expect(bucketIndex(new Date(2026, 9, 31, 9).toISOString(), month)).toBe(-1)
    expect(bucketIndex('không phải ngày', month)).toBe(-1)
    const prev = previousRange(periodRange('day', 0, now), now)
    expect(bucketIndex(new Date(2026, 10, 11, 8, 30).toISOString(), prev)).toBe(8)
    expect(bucketIndex(new Date(2026, 10, 11, 9, 30).toISOString(), prev)).toBe(-1)
  })
})

describe('highlight', () => {
  it('tổng 0 → null', () => {
    expect(highlight(periodRange('week', 0, now), [0, 0, 0, 0])).toBeNull()
  })
  it('bucket lớn nhất gấp mấy lần trung bình các ngày đã qua', () => {
    expect(highlight(periodRange('week', 0, now), [0, 30, 0, 90])).toEqual({
      bucket: '2026-11-12',
      value: 90,
      times: 3,
    })
  })
  it('ngày hiện tại: chỉ tính tới giờ hiện tại khi biết `now`', () => {
    const amount = Array.from({ length: 24 }, () => 0)
    amount[8] = 90
    amount[1] = 90
    expect(highlight(periodRange('day', 0, now), amount, now)).toMatchObject({
      bucket: '01',
      times: 5,
    })
  })
})

describe('periodLabel', () => {
  const t = (key: string, o?: Record<string, unknown>) => `${key}|${JSON.stringify(o ?? {})}`
  it('tháng: số tháng + khoảng ngày', () => {
    expect(periodLabel(periodRange('month', 0, now), 'vi', t)).toBe(
      'period.month|{"month":11,"range":"01–12/11"}',
    )
  })
  it('tuần này: đủ T2..CN', () => {
    expect(periodLabel(periodRange('week', 0, now), 'vi', t)).toBe(
      'period.weekThis|{"range":"09–15/11"}',
    )
  })
  it('ngày / năm', () => {
    expect(periodLabel(periodRange('day', 0, now), 'vi', t)).toBe('period.today|{}')
    expect(periodLabel(periodRange('day', 1, now), 'vi', t)).toBe('period.yesterday|{}')
    expect(periodLabel(periodRange('year', 0, now), 'vi', t)).toBe('period.year|{"year":2026}')
  })
  it('tuần qua ranh giới tháng', () => {
    expect(periodLabel(periodRange('week', 2, now), 'vi', t)).toContain('26/10–01/11')
  })
})
