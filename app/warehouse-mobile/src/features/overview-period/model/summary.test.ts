import { periodRange, previousRange, type SlimForm } from './period'
import {
  compareDelta,
  compareName,
  elapsedBuckets,
  flowOf,
  percentChange,
  splitAmount,
  type Flow,
} from './summary'

const NOW = new Date(2026, 10, 12, 8, 45)
const form = (slug: string, createdAt: string, amount: number): SlimForm => ({
  slug,
  code: slug,
  createdAt,
  amount,
  party: null,
  kind: 'import',
})
const t = (key: string, o?: Record<string, unknown>) => `${key}${o ? JSON.stringify(o) : ''}`

describe('splitAmount', () => {
  it('tách số và đơn vị, nối lại đúng chuỗi gốc', () => {
    expect(splitAmount('3,1 tr đ')).toEqual(['3,1', ' tr đ'])
    expect(splitAmount('4.440 đ')).toEqual(['4.440', ' đ'])
    expect(splitAmount('+3,1 tr đ')).toEqual(['+3,1', ' tr đ'])
    expect(splitAmount('−850.000 đ')).toEqual(['−850.000', ' đ'])
    expect(splitAmount('3.1M đ')).toEqual(['3.1', 'M đ'])
    expect(splitAmount('–')).toEqual(['–', ''])
  })
})

describe('elapsedBuckets', () => {
  it('kỳ hiện tại: tới giờ / ngày / tháng hiện tại; kỳ đã qua: tất cả', () => {
    expect(elapsedBuckets(periodRange('day', 0, NOW), NOW)).toBe(9)
    expect(elapsedBuckets(periodRange('week', 0, NOW), NOW)).toBe(4)
    expect(elapsedBuckets(periodRange('month', 0, NOW), NOW)).toBe(12)
    expect(elapsedBuckets(periodRange('year', 0, NOW), NOW)).toBe(11)
    expect(elapsedBuckets(periodRange('month', 1, NOW), NOW)).toBe(31)
    expect(elapsedBuckets(periodRange('day', 2, NOW), NOW)).toBe(24)
  })
})

describe('flowOf', () => {
  const info = periodRange('month', 0, NOW)

  it('đang tải / lỗi / vượt trần / có số', () => {
    expect(flowOf({ isError: false, isPlaceholderData: false }, info)).toEqual({ state: 'loading' })
    expect(flowOf({ isError: true, isPlaceholderData: false }, info)).toEqual({ state: 'failed' })
    expect(
      flowOf(
        { data: { forms: [], truncated: true }, isError: false, isPlaceholderData: false },
        info,
      ),
    ).toEqual({ state: 'truncated', stale: false })
    const ok = flowOf(
      {
        data: {
          forms: [
            form('a', '2026-11-01T09:00:00', 100),
            form('b', '2026-11-01T10:00:00', 50),
            form('c', '2026-11-12T08:00:00', 7),
          ],
          truncated: false,
        },
        isError: false,
        isPlaceholderData: false,
      },
      info,
    )
    expect(ok).toMatchObject({ state: 'ok', stale: false, amount: 157, count: 3 })
    if (ok.state !== 'ok') throw new Error()
    expect(ok.bars.amount[0]).toBe(150)
    expect(ok.bars.amount[11]).toBe(7)
    expect(ok.bars.count[0]).toBe(2)
  })

  it('lỗi khi đã có số (làm mới lỗi) → giữ số', () => {
    const data = { forms: [form('a', '2026-11-02T09:00:00', 10)], truncated: false }
    expect(flowOf({ data, isError: true, isPlaceholderData: false }, info)).toMatchObject({
      state: 'ok',
      amount: 10,
    })
  })

  it('kỳ so sánh của kỳ đang chạy: bỏ phiếu sau mốc cùng thời điểm', () => {
    const prev = previousRange(info, NOW)
    const data = {
      forms: [form('a', '2026-10-12T08:00:00', 10), form('b', '2026-10-12T10:00:00', 99)],
      truncated: false,
    }
    expect(flowOf({ data, isError: false, isPlaceholderData: false }, prev)).toMatchObject({
      amount: 10,
      count: 1,
    })
  })

  it('ok: số ô đã qua tính theo `now` lúc gom (ô chưa tới của kỳ đang chạy không vẽ)', () => {
    const data = { forms: [form('a', '2026-11-02T09:00:00', 10)], truncated: false }
    expect(flowOf({ data, isError: false, isPlaceholderData: false }, info, NOW)).toMatchObject({
      elapsed: 12,
    })
    const past = { forms: [], truncated: false }
    expect(
      flowOf(
        { data: past, isError: false, isPlaceholderData: false },
        periodRange('month', 1, NOW),
      ),
    ).toMatchObject({ elapsed: 31 })
  })

  it('dữ liệu tạm (đổi kỳ cùng kho): hiện số đã tính của kỳ cũ, đánh dấu stale', () => {
    const data = { forms: [form('a', '2026-11-03T09:00:00', 42)], truncated: false }
    flowOf({ data, isError: false, isPlaceholderData: false }, info, NOW)
    const week = periodRange('week', 1, NOW)
    // Giữ số ô đã qua của kỳ cũ (12/30 ngày tháng 11), không tính lại theo kỳ mới.
    expect(flowOf({ data, isError: false, isPlaceholderData: true }, week, NOW)).toMatchObject({
      state: 'ok',
      stale: true,
      amount: 42,
      elapsed: 12,
    })
    // Chưa từng tính (không có trong bộ nhớ) → coi như đang tải, không đoán số.
    const other = { forms: [form('x', '2026-11-03T09:00:00', 1)], truncated: false }
    expect(flowOf({ data: other, isError: false, isPlaceholderData: true }, week)).toEqual({
      state: 'loading',
    })
  })
})

describe('compareName', () => {
  it('tên kỳ so sánh theo loại kỳ', () => {
    const prevOf = (p: 'day' | 'week' | 'month' | 'year', offset: number) =>
      previousRange(periodRange(p, offset, NOW), NOW)
    expect(compareName(prevOf('day', 0), 'vi', t)).toBe('compare.yesterday')
    expect(compareName(prevOf('day', 1), 'vi', t)).toBe('compare.day{"date":"10/11"}')
    expect(compareName(prevOf('day', 1), 'en', t)).toBe('compare.day{"date":"11/10"}')
    expect(compareName(prevOf('week', 0), 'vi', t)).toBe('compare.lastWeek')
    expect(compareName(prevOf('week', 1), 'vi', t)).toBe('compare.week{"date":"26/10"}')
    expect(compareName(prevOf('month', 0), 'vi', t)).toBe('compare.month{"month":"monthName.10"}')
    expect(compareName(prevOf('year', 0), 'vi', t)).toBe('compare.year{"year":2025}')
  })
})

describe('percentChange', () => {
  it('tăng, giảm, trước = 0, làm tròn', () => {
    expect(percentChange(112, 100)).toBe(12)
    expect(percentChange(95, 100)).toBe(-5)
    expect(percentChange(5, 0)).toBeNull()
    expect(percentChange(1, 3)).toBe(-67)
  })
})

describe('compareDelta', () => {
  const t = (key: string, o?: Record<string, unknown>) => `${key}${o ? JSON.stringify(o) : ''}`
  const ok = (amount: number, stale = false): Flow => ({
    state: 'ok',
    stale,
    amount,
    count: 1,
    bars: { buckets: [], amount: [], count: [] },
    elapsed: 0,
  })
  it('tăng / giảm / bằng / kỳ trước 0', () => {
    expect(compareDelta(ok(112), ok(100), 'tháng 10', 'vi', t)?.text).toBe(
      'delta.up{"pct":12,"name":"tháng 10"}',
    )
    expect(compareDelta(ok(95), ok(100), 'tháng 10', 'vi', t)?.a11y).toBe(
      'delta.downA11y{"pct":5,"name":"tháng 10"}',
    )
    expect(compareDelta(ok(100), ok(100), 'tháng 10', 'vi', t)?.text).toBe(
      'delta.same{"name":"tháng 10"}',
    )
    expect(compareDelta(ok(5), ok(0), 'tháng 10', 'vi', t)?.text).toBe(
      'delta.zero{"name":"Tháng 10","amount":"0 đ"}',
    )
  })
  it('thiếu số hoặc số tạm → null', () => {
    expect(compareDelta(ok(5, true), ok(1), 'x', 'vi', t)).toBeNull()
    expect(compareDelta(ok(5), { state: 'loading' }, 'x', 'vi', t)).toBeNull()
    expect(compareDelta({ state: 'truncated', stale: false }, ok(1), 'x', 'vi', t)).toBeNull()
  })
})
