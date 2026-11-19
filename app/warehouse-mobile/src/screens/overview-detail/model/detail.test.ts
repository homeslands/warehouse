import { periodRange, type SlimForm } from '@/features/overview-period'

import {
  axisMoney,
  bucketText,
  isDetailMetric,
  sortForms,
  spanText,
  tickText,
  whenText,
} from './detail'

const now = new Date(2026, 10, 12, 8, 45) // thứ Năm 12/11/2026
const t = (key: string, o?: Record<string, unknown>) => {
  if (key.startsWith('detail.mon.')) return `thg ${key.slice(11)}`
  if (key.startsWith('monthName.')) return `tháng ${key.slice(10)}`
  if (key.startsWith('weekdayLong.')) return `W${key.slice(12)}`
  return `${key}${o ? JSON.stringify(o) : ''}`
}

describe('isDetailMetric', () => {
  it('chỉ import / export / activity', () => {
    expect(['import', 'export', 'activity'].every(isDetailMetric)).toBe(true)
    expect(isDetailMetric('foo')).toBe(false)
    expect(isDetailMetric(undefined)).toBe(false)
  })
})

describe('spanText', () => {
  it('cùng tháng / khác tháng / một ngày / khác năm', () => {
    expect(spanText(periodRange('month', 0, now), 'vi', t)).toBe('1–12 thg 11, 2026')
    expect(spanText(periodRange('month', 0, now), 'en', t)).toBe('thg 11 1–12, 2026')
    expect(
      spanText(
        { ...periodRange('week', 0, now), startDate: '2026-10-26', endDate: '2026-11-01' },
        'vi',
        t,
      ),
    ).toBe('26 thg 10 – 1 thg 11, 2026')
    expect(spanText(periodRange('day', 0, now), 'vi', t)).toBe('12 thg 11, 2026')
    expect(
      spanText(
        { ...periodRange('week', 0, now), startDate: '2025-12-29', endDate: '2026-01-04' },
        'vi',
        t,
      ),
    ).toBe('29 thg 12, 2025 – 4 thg 1, 2026')
  })
})

describe('bucketText / whenText', () => {
  it('giờ, ngày, tháng', () => {
    expect(bucketText('07', 'day', 'vi', t)).toBe('detail.bucket.hour{"from":"07:00","to":"08:00"}')
    expect(bucketText('23', 'day', 'vi', t)).toContain('"to":"00:00"')
    expect(bucketText('2026-11-06', 'month', 'vi', t)).toBe(
      'detail.bucket.day{"weekday":"W5","date":"06/11"}',
    )
    expect(bucketText('2026-06', 'year', 'vi', t)).toBe(
      'detail.bucket.month{"month":"Tháng 6","year":2026}',
    )
    expect(whenText('07', 'day', 'vi', t)).toBe('07:00')
    expect(whenText('2026-11-06', 'week', 'en', t)).toBe('11/06')
    expect(whenText('2026-06', 'year', 'vi', t)).toBe('tháng 6')
  })
})

describe('tickText', () => {
  const wd = (d: string) => `wd${d.slice(-2)}`
  it('thưa bớt theo kỳ', () => {
    const day = periodRange('day', 0, now).buckets.map((b, i) => tickText(b, i, 'day', wd, t))
    expect(day.filter(Boolean)).toEqual(['00', '06', '12', '18'])
    const month = periodRange('month', 0, now).buckets.map((b, i) => tickText(b, i, 'month', wd, t))
    expect(month.filter(Boolean)).toEqual(['1', '6', '11', '16', '21', '26'])
    expect(tickText('2026-11-09', 0, 'week', wd, t)).toBe('wd09')
    expect(tickText('2026-01', 0, 'year', wd, t)).toBe('detail.monthTick.1')
  })
})

describe('axisMoney', () => {
  it('rút gọn cho vạch trục', () => {
    expect(axisMoney(0, 'vi')).toBe('0')
    expect(axisMoney(2_000_000, 'vi')).toBe('2 tr')
    expect(axisMoney(500_000, 'vi')).toBe('500 N')
    expect(axisMoney(1_500_000_000, 'vi')).toBe('1,5 tỷ')
    expect(axisMoney(2_000_000, 'en')).toBe('2M')
  })
})

describe('sortForms', () => {
  const f = (slug: string, createdAt: string, amount: number): SlimForm => ({
    slug,
    code: slug,
    createdAt,
    amount,
    party: null,
    kind: 'import',
  })
  const forms = [
    f('a', '2026-11-01T09:00:00', 10),
    f('b', '2026-11-03T09:00:00', 30),
    f('c', '2026-11-02T09:00:00', 30),
  ]
  it('tiền giảm dần (cùng tiền → mới hơn trước); hoạt động: mới nhất trước', () => {
    expect(sortForms(forms, 'import').map((x) => x.slug)).toEqual(['b', 'c', 'a'])
    expect(sortForms(forms, 'activity').map((x) => x.slug)).toEqual(['b', 'c', 'a'])
    expect(
      sortForms(forms.slice(0, 2).concat(f('d', '2026-11-05T09:00:00', 1)), 'activity').map(
        (x) => x.slug,
      ),
    ).toEqual(['d', 'b', 'a'])
  })
})
