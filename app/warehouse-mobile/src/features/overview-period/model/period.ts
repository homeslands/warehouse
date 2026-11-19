import type { SlimForm } from '@/shared/lib/slim-form'

export type Period = 'day' | 'week' | 'month' | 'year'
/** `YYYY-MM-DD` giờ máy, gồm cả hai đầu. */
export type Range = { startDate: string; endDate: string }
export type PeriodInfo = Range & {
  period: Period
  offset: number
  current: boolean
  /**
   * day → '00'..'23'; week → 7 ngày `YYYY-MM-DD` (T2..CN, kể cả ngày chưa tới); month → mọi ngày của
   * tháng; year → 'YYYY-01'..'YYYY-12'.
   */
  buckets: string[]
  /** Chỉ có ở kỳ so sánh của kỳ hiện tại: phiếu sau mốc này bị bỏ (cùng thời điểm tương ứng). */
  cutoff?: Date
}
export type { SlimForm }
export type Translate = (key: string, options?: Record<string, unknown>) => string

const two = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
/** Thứ Hai của tuần chứa `d` (tuần bắt đầu thứ Hai). */
const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7))
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

/** Kỳ thứ `offset` tính ngược từ kỳ chứa `now` (0 = hiện tại). Kỳ hiện tại luôn kết thúc HÔM NAY. */
export function periodRange(period: Period, offset: number, now: Date): PeriodInfo {
  const current = offset === 0
  const today = startOfDay(now)
  const info = (start: Date, last: Date, buckets: string[]): PeriodInfo => ({
    period,
    offset,
    current,
    startDate: iso(start),
    endDate: iso(current ? today : last),
    buckets,
  })
  switch (period) {
    case 'day': {
      const d = addDays(today, -offset)
      return info(
        d,
        d,
        Array.from({ length: 24 }, (_, h) => two(h)),
      )
    }
    case 'week': {
      const mon = addDays(mondayOf(today), -7 * offset)
      return info(
        mon,
        addDays(mon, 6),
        Array.from({ length: 7 }, (_, i) => iso(addDays(mon, i))),
      )
    }
    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      const n = daysInMonth(first.getFullYear(), first.getMonth())
      return info(
        first,
        new Date(first.getFullYear(), first.getMonth(), n),
        Array.from({ length: n }, (_, i) =>
          iso(new Date(first.getFullYear(), first.getMonth(), i + 1)),
        ),
      )
    }
    case 'year': {
      const y = now.getFullYear() - offset
      return info(
        new Date(y, 0, 1),
        new Date(y, 11, 31),
        Array.from({ length: 12 }, (_, i) => `${y}-${two(i + 1)}`),
      )
    }
  }
}

/**
 * Kỳ liền trước, cùng độ dài. Kỳ hiện tại → so tới CÙNG thời điểm tương ứng (ngày kẹp về cuối tháng
 * ngắn hơn; `cutoff` = cùng giờ phút; nếu ngày bị kẹp thì lấy hết ngày đó). Kỳ đã qua → so cả kỳ trước.
 */
export function previousRange(info: PeriodInfo, now: Date): PeriodInfo {
  const full = periodRange(info.period, info.offset + 1, now)
  if (!info.current) return full
  const today = startOfDay(now)
  const withCutoff = (end: Date, clamped: boolean): PeriodInfo => ({
    ...full,
    endDate: iso(end),
    cutoff: clamped
      ? endOfDay(end)
      : new Date(
          end.getFullYear(),
          end.getMonth(),
          end.getDate(),
          now.getHours(),
          now.getMinutes(),
          now.getSeconds(),
          now.getMilliseconds(),
        ),
  })
  switch (info.period) {
    case 'day':
      return withCutoff(addDays(today, -1), false)
    case 'week':
      return withCutoff(addDays(parse(full.startDate), (today.getDay() + 6) % 7), false)
    case 'month': {
      const [y, m] = ymd(full.startDate)
      const last = daysInMonth(y, m)
      const day = Math.min(now.getDate(), last)
      return withCutoff(new Date(y, m, day), day !== now.getDate())
    }
    case 'year': {
      const [y] = ymd(full.startDate)
      const day = Math.min(now.getDate(), daysInMonth(y, now.getMonth()))
      return withCutoff(new Date(y, now.getMonth(), day), day !== now.getDate())
    }
  }
}

const parse = (date: string) => {
  const [y, m, d] = ymd(date)
  return new Date(y, m, d)
}

function ymd(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m - 1, d]
}

function rangeText(startDate: string, endDate: string, lng: 'vi' | 'en'): string {
  const [, sm, sd] = ymd(startDate)
  const [, em, ed] = ymd(endDate)
  const dm = (m: number, d: number) =>
    lng === 'vi' ? `${two(d)}/${two(m + 1)}` : `${two(m + 1)}/${two(d)}`
  if (lng === 'vi') {
    return sm === em ? `${two(sd)}–${two(ed)}/${two(em + 1)}` : `${dm(sm, sd)}–${dm(em, ed)}`
  }
  return `${dm(sm, sd)}–${dm(em, ed)}`
}

/** Nhãn kỳ: "Tháng 11 · 01–12/11", "Tuần này · 09–15/11", "Hôm nay", "Năm 2026". */
export function periodLabel(info: PeriodInfo, lng: 'vi' | 'en', t: Translate): string {
  switch (info.period) {
    case 'day':
      if (info.offset === 0) return t('period.today')
      if (info.offset === 1) return t('period.yesterday')
      return t('period.day', { range: rangeText(info.startDate, info.startDate, lng) })
    case 'week': {
      // Tuần luôn hiện đủ T2..CN, kể cả khi kỳ hiện tại mới tới hôm nay.
      const range = rangeText(info.buckets[0], info.buckets[6], lng)
      if (info.offset === 0) return t('period.weekThis', { range })
      if (info.offset === 1) return t('period.weekPrev', { range })
      return t('period.week', { range })
    }
    case 'month': {
      const [, m] = ymd(info.startDate)
      return t('period.month', {
        month: m + 1,
        range: rangeText(info.startDate, info.endDate, lng),
      })
    }
    case 'year':
      return t('period.year', { year: ymd(info.startDate)[0] })
  }
}

/** Khoá bucket của một thời điểm; `null` nếu không thuộc kỳ. */
function bucketKey(d: Date, info: PeriodInfo): string | null {
  switch (info.period) {
    case 'day':
      return iso(d) === info.startDate ? two(d.getHours()) : null
    case 'week':
    case 'month':
      return iso(d)
    case 'year':
      return `${d.getFullYear()}-${two(d.getMonth() + 1)}`
  }
}

/**
 * Chỉ số bucket của thời điểm `createdAt` trong kỳ (giờ máy); -1 nếu ngày hỏng, sau `info.cutoff` hoặc
 * ngoài kỳ. Dùng chung cho `bucketize` và danh sách phiếu của màn chi tiết (cùng tập phiếu với tổng).
 */
export function bucketIndex(createdAt: string, info: PeriodInfo): number {
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return -1
  if (info.cutoff && d.getTime() > info.cutoff.getTime()) return -1
  const key = bucketKey(d, info)
  return key === null ? -1 : info.buckets.indexOf(key)
}

/** Gom phiếu theo bucket của kỳ (giờ máy); phiếu sau `info.cutoff` hoặc ngoài kỳ bị bỏ. */
export function bucketize(
  forms: SlimForm[],
  info: PeriodInfo,
): { buckets: string[]; amount: number[]; count: number[] } {
  const amount = info.buckets.map(() => 0)
  const count = info.buckets.map(() => 0)
  for (const f of forms) {
    const i = bucketIndex(f.createdAt, info)
    if (i === -1) continue
    amount[i] += f.amount
    count[i] += 1
  }
  return { buckets: info.buckets, amount, count }
}

/**
 * Bucket lớn nhất + "gấp mấy lần" trung bình các bucket đã qua (kỳ hiện tại: tới hôm nay / giờ hiện
 * tại nếu truyền `now`; kỳ đã qua: tất cả). `null` nếu tổng bằng 0.
 */
export function highlight(
  info: PeriodInfo,
  amount: number[],
  now?: Date,
): { bucket: string; value: number; times: number } | null {
  if (!amount.some((v) => v !== 0)) return null
  let elapsed = info.buckets.length
  if (info.current) {
    if (info.period === 'day') elapsed = now ? now.getHours() + 1 : elapsed
    else {
      const upTo = info.period === 'year' ? info.endDate.slice(0, 7) : info.endDate
      elapsed = info.buckets.filter((b) => b <= upTo).length
    }
  }
  const past = amount.slice(0, elapsed)
  const avg = past.reduce((a, b) => a + b, 0) / Math.max(past.length, 1)
  let at = 0
  amount.forEach((v, i) => {
    if (v > amount[at]) at = i
  })
  return {
    bucket: info.buckets[at],
    value: amount[at],
    times: avg > 0 ? Math.round(amount[at] / avg) : 0,
  }
}
