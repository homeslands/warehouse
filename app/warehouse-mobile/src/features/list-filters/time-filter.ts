import { parseLocalDate, todayLocalIso } from '@/shared/lib/format'

/** Mốc thời gian nhanh. Store giữ ID (không giữ ngày) nên "Hôm nay" vẫn đúng sau nửa đêm. */
export const TIME_PRESETS = ['today', 'last7', 'last30', 'thisMonth'] as const
export type TimePreset = (typeof TIME_PRESETS)[number]

/** Khoảng ngày tự chọn, `YYYY-MM-DD` (giờ máy), tính cả hai đầu. */
export type DateRange = { from: string; to: string }

/** `null` = mọi thời gian. */
export type TimeFilter = TimePreset | DateRange | null

/** Đến < từ → đảo lại (như `toCreatedRange` của web). ISO cùng độ dài so được như chuỗi. */
export function orderedRange(from: string, to: string): DateRange {
  return from > to ? { from: to, to: from } : { from, to }
}

const daysBefore = (now: Date, days: number) =>
  todayLocalIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days))

/**
 * Tham số `startDate`/`endDate` cho GET danh sách, tính theo giờ máy LÚC DỰNG QUERY:
 * Hôm nay = hôm nay; 7 ngày qua = hôm nay − 6 … hôm nay; 30 ngày qua = hôm nay − 29 … hôm nay;
 * Tháng này = mùng 1 … hôm nay; khoảng tự chọn gửi nguyên (đã đảo nếu ngược).
 */
export function timeRange(filter: TimeFilter, now: Date): { startDate?: string; endDate?: string } {
  if (filter === null) return {}
  const today = todayLocalIso(now)
  if (typeof filter === 'object') {
    const { from, to } = orderedRange(filter.from, filter.to)
    return { startDate: from, endDate: to }
  }
  switch (filter) {
    case 'today':
      return { startDate: today, endDate: today }
    case 'last7':
      return { startDate: daysBefore(now, 6), endDate: today }
    case 'last30':
      return { startDate: daysBefore(now, 29), endDate: today }
    case 'thisMonth':
      return {
        startDate: todayLocalIso(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: today,
      }
  }
}

const two = (n: number) => String(n).padStart(2, '0')

/**
 * Nhãn chip của khoảng tự chọn: "dd/MM – dd/MM"; có mốc ngoài năm hiện tại thì thêm năm cho cả hai
 * mốc; một ngày → một mốc.
 */
export function formatRangeLabel(range: DateRange, now: Date): string {
  const { from, to } = orderedRange(range.from, range.to)
  const a = parseLocalDate(from)
  const b = parseLocalDate(to)
  const year = now.getFullYear()
  const withYear = a.getFullYear() !== year || b.getFullYear() !== year
  const fmt = (d: Date) =>
    `${two(d.getDate())}/${two(d.getMonth() + 1)}${withYear ? `/${d.getFullYear()}` : ''}`
  return from === to ? fmt(a) : `${fmt(a)} – ${fmt(b)}`
}
