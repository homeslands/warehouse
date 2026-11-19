import { formatMoney } from '@/shared/lib/format'

import { bucketize, type PeriodInfo, type SlimForm, type Translate } from './period'

/** Kết quả `use*ConfirmedForms` mà trang Tóm tắt cần. */
export type ConfirmedQuery = {
  data?: { forms: SlimForm[]; truncated: boolean }
  isError: boolean
  isPlaceholderData: boolean
}

/**
 * Một nhóm phiếu đã xác nhận của một kỳ. `stale` = số của kỳ trước đó đang chờ kỳ mới (đổi kỳ cùng kho,
 * hiện mờ). Lỗi > đang tải > vượt trần > có số.
 */
export type Flow =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'truncated'; stale: boolean }
  | {
      state: 'ok'
      stale: boolean
      amount: number
      count: number
      bars: { buckets: string[]; amount: number[]; count: number[] }
      /** Số ô đã qua của kỳ lúc gom (ô sau đó chưa tới → không vẽ); giữ nguyên khi thành dữ liệu tạm. */
      elapsed: number
    }

/**
 * Số đã tính của từng bộ dữ liệu (theo tham chiếu): khi đổi kỳ cùng kho, query trả lại CHÍNH dữ liệu của
 * kỳ cũ làm placeholder — tra ở đây để hiện số của kỳ cũ (gom theo kỳ cũ), không gom lại theo kỳ mới.
 */
const computed = new WeakMap<object, Flow>()

/** `now` chỉ cần cho kỳ đang chạy có vẽ cột (không truyền → coi mọi ô đã qua). */
export function flowOf(q: ConfirmedQuery, info: PeriodInfo, now?: Date): Flow {
  const data = q.data
  if (data === undefined) return q.isError ? { state: 'failed' } : { state: 'loading' }
  if (q.isPlaceholderData) {
    const old = computed.get(data)
    if (!old || old.state === 'loading' || old.state === 'failed') return { state: 'loading' }
    return { ...old, stale: true }
  }
  let flow: Flow
  if (data.truncated) flow = { state: 'truncated', stale: false }
  else {
    const bars = bucketize(data.forms, info)
    flow = {
      state: 'ok',
      stale: false,
      amount: bars.amount.reduce((a, b) => a + b, 0),
      count: bars.count.reduce((a, b) => a + b, 0),
      bars,
      elapsed: now ? elapsedBuckets(info, now) : info.buckets.length,
    }
  }
  computed.set(data, flow)
  return flow
}

/** Tách "3,1 tr đ" → ["3,1", " tr đ"] (số to + đơn vị nhỏ); nối hai phần = chuỗi gốc. */
export function splitAmount(text: string): [string, string] {
  const m = /^([+\-−]?\d[\d.,]*)(.*)$/s.exec(text)
  return m ? [m[1], m[2]] : [text, '']
}

/** Số bucket đã qua của kỳ (kỳ đang chạy: tới giờ / ngày / tháng hiện tại); bucket sau đó chưa tới. */
export function elapsedBuckets(info: PeriodInfo, now: Date): number {
  if (!info.current) return info.buckets.length
  if (info.period === 'day') return now.getHours() + 1
  const upTo = info.period === 'year' ? info.endDate.slice(0, 7) : info.endDate
  return info.buckets.filter((b) => b <= upTo).length
}

const dayMonth = (date: string, lng: 'vi' | 'en') => {
  const [, m, d] = date.split('-')
  return lng === 'vi' ? `${d}/${m}` : `${m}/${d}`
}

/** Tên kỳ so sánh (viết thường, dùng giữa câu): "hôm qua", "tuần trước", "tháng 10", "năm 2025". */
export function compareName(prev: PeriodInfo, lng: 'vi' | 'en', t: Translate): string {
  switch (prev.period) {
    case 'day':
      return prev.offset === 1
        ? t('compare.yesterday')
        : t('compare.day', { date: dayMonth(prev.startDate, lng) })
    case 'week':
      return prev.offset === 1
        ? t('compare.lastWeek')
        : t('compare.week', { date: dayMonth(prev.startDate, lng) })
    case 'month':
      return t('compare.month', { month: t(`monthName.${Number(prev.startDate.slice(5, 7))}`) })
    case 'year':
      return t('compare.year', { year: Number(prev.startDate.slice(0, 4)) })
  }
}

/** % thay đổi làm tròn số nguyên; kỳ trước = 0 thì `null` (không chia được). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Dòng "so kỳ trước" theo TIỀN: "▲ 12% so tháng 10" / "▼ …" / "Bằng …"; kỳ trước = 0 → "Tháng 10: 0 đ".
 * Chỉ khi cả hai kỳ đủ số VÀ đều là số của kỳ đang xem (số tạm của kỳ cũ mang tên kỳ so sánh mới sẽ sai
 * nghĩa) — còn lại `null`. `prevName` = tên kỳ so sánh viết thường (`compareName`).
 */
export function compareDelta(
  current: Flow,
  previous: Flow,
  prevName: string,
  lng: 'vi' | 'en',
  t: Translate,
): { text: string; a11y: string } | null {
  if (current.state !== 'ok' || previous.state !== 'ok' || current.stale || previous.stale)
    return null
  const pct = percentChange(Math.round(current.amount), Math.round(previous.amount))
  if (pct === null) {
    const text = t('delta.zero', { name: capitalize(prevName), amount: formatMoney(0, lng) })
    return { text, a11y: text }
  }
  if (pct === 0) {
    const text = t('delta.same', { name: prevName })
    return { text, a11y: text }
  }
  const key = pct > 0 ? 'up' : 'down'
  const o = { pct: Math.abs(pct), name: prevName }
  return { text: t(`delta.${key}`, o), a11y: t(`delta.${key}A11y`, o) }
}

/**
 * Mốc cắt của kỳ so sánh. Kỳ đang chạy: số kỳ này chỉ tới lúc tải (`dataUpdatedAt`), nên cắt kỳ trước ở
 * đúng lúc đó (không phải giờ vẽ lại, sẽ lệch khi app mở lâu). Chưa có số / sang ngày khác → `wall`.
 */
export function comparisonNow(info: PeriodInfo, wall: Date, updatedAt: readonly number[]): Date {
  if (!info.current) return wall
  const known = updatedAt.filter((t) => t > 0)
  if (known.length === 0) return wall
  const at = new Date(Math.min(wall.getTime(), ...known))
  const sameDay =
    at.getFullYear() === wall.getFullYear() &&
    at.getMonth() === wall.getMonth() &&
    at.getDate() === wall.getDate()
  return sameDay ? at : wall
}
