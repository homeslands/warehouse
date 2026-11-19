import type { Period, PeriodInfo, SlimForm, Translate } from '@/features/overview-period'

export const DETAIL_METRICS = ['import', 'export', 'activity'] as const
export type DetailMetric = (typeof DETAIL_METRICS)[number]

export const isDetailMetric = (value: unknown): value is DetailMetric =>
  typeof value === 'string' && (DETAIL_METRICS as readonly string[]).includes(value)

type Lng = 'vi' | 'en'

const ymd = (date: string) => date.split('-').map(Number) as [number, number, number]
const two = (n: number) => String(n).padStart(2, '0')
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "06/11" (vi) / "11/06" (en). */
export const dayMonth = (date: string, lng: Lng) => {
  const [, m, d] = ymd(date)
  return lng === 'vi' ? `${two(d)}/${two(m)}` : `${two(m)}/${two(d)}`
}

/** Đơn vị của một ô thời gian: Ngày → giờ, Tuần / Tháng → ngày, Năm → tháng. */
export const bucketUnit = (period: Period): 'hour' | 'day' | 'month' =>
  period === 'day' ? 'hour' : period === 'year' ? 'month' : 'day'

/**
 * Khoảng ngày thật của kỳ (kỳ đang chạy tới hôm nay): "1–12 thg 11, 2026", "26 thg 10 – 1 thg 11, 2026",
 * "12 thg 11, 2026"; en "Nov 1–12, 2026".
 */
export function spanText(info: PeriodInfo, lng: Lng, t: Translate): string {
  const [y1, m1, d1] = ymd(info.startDate)
  const [y2, m2, d2] = ymd(info.endDate)
  const mon = (m: number) => t(`detail.mon.${m}`)
  const dm = (m: number, d: number) => (lng === 'vi' ? `${d} ${mon(m)}` : `${mon(m)} ${d}`)
  if (info.startDate === info.endDate) return `${dm(m1, d1)}, ${y1}`
  if (y1 === y2 && m1 === m2)
    return lng === 'vi' ? `${d1}–${d2} ${mon(m1)}, ${y1}` : `${mon(m1)} ${d1}–${d2}, ${y1}`
  if (y1 === y2) return `${dm(m1, d1)} – ${dm(m2, d2)}, ${y1}`
  return `${dm(m1, d1)}, ${y1} – ${dm(m2, d2)}, ${y2}`
}

/** Tên đầy đủ của một ô (dòng phụ khi chọn cột): "07:00–08:00", "Thứ Sáu, 06/11", "Tháng 6, 2026". */
export function bucketText(bucket: string, period: Period, lng: Lng, t: Translate): string {
  switch (bucketUnit(period)) {
    case 'hour': {
      const h = Number(bucket)
      return t('detail.bucket.hour', { from: `${two(h)}:00`, to: `${two((h + 1) % 24)}:00` })
    }
    case 'day': {
      const [y, m, d] = ymd(bucket)
      const weekday = t(`weekdayLong.${new Date(y, m - 1, d).getDay()}`)
      return t('detail.bucket.day', { weekday, date: dayMonth(bucket, lng) })
    }
    case 'month': {
      const [y, m] = ymd(bucket)
      return t('detail.bucket.month', { month: capitalize(t(`monthName.${m}`)), year: y })
    }
  }
}

/** Tên ngắn của ô trong câu "Nổi bật": "07:00", "06/11", "tháng 6". */
export function whenText(bucket: string, period: Period, lng: Lng, t: Translate): string {
  switch (bucketUnit(period)) {
    case 'hour':
      return `${two(Number(bucket))}:00`
    case 'day':
      return dayMonth(bucket, lng)
    case 'month':
      return t(`monthName.${ymd(bucket)[1]}`)
  }
}

/**
 * Nhãn trục thời gian (thưa bớt): Ngày → 00 / 06 / 12 / 18; Tuần → T2…CN; Tháng → 1, 6, 11, 16, 21, 26;
 * Năm → T1…T12. `null` = ô không ghi nhãn.
 */
export function tickText(
  bucket: string,
  index: number,
  period: Period,
  weekday: (date: string) => string,
  t: Translate,
): string | null {
  switch (period) {
    case 'day':
      return index % 6 === 0 ? bucket : null
    case 'week':
      return weekday(bucket)
    case 'month':
      return index % 5 === 0 ? String(index + 1) : null
    case 'year':
      return t(`detail.monthTick.${index + 1}`)
  }
}

const AXIS_UNITS = {
  vi: [
    { min: 1e9, suffix: ' tỷ' },
    { min: 1e6, suffix: ' tr' },
    { min: 1e3, suffix: ' N' },
  ],
  en: [
    { min: 1e9, suffix: 'B' },
    { min: 1e6, suffix: 'M' },
    { min: 1e3, suffix: 'K' },
  ],
} as const

/**
 * Nhãn vạch trục tiền (cột hẹp bên phải biểu đồ, không có "đ"): "2 tr", "500 N", "1,5 tỷ" / "2M", "500K".
 * Chỉ dùng cho vạch trục — số tiền thật trên màn vẫn qua `formatMoney`.
 */
export function axisMoney(value: number, lng: Lng): string {
  const unit = AXIS_UNITS[lng].find((u) => value >= u.min)
  const n = unit ? value / unit.min : value
  const text = new Intl.NumberFormat(lng === 'vi' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: 1,
  }).format(n)
  return unit ? `${text}${unit.suffix}` : text
}

/** Danh sách phiếu: Nhập / Xuất theo tiền giảm dần (cùng tiền → mới hơn trước); Hoạt động theo ngày mới nhất. */
export function sortForms(forms: SlimForm[], metric: DetailMetric): SlimForm[] {
  const time = (f: SlimForm) => new Date(f.createdAt).getTime() || 0
  return [...forms].sort((a, b) =>
    metric === 'activity' ? time(b) - time(a) : b.amount - a.amount || time(b) - time(a),
  )
}
