import { parseLocalDate } from '@/shared/lib/format'

export { formatShortDate, parseLocalDate } from '@/shared/lib/format'

export const EXPIRY_SOON_DAYS = 60

export type ExpiryStatus = { kind: 'none' | 'expired' | 'soon' | 'ok'; days: number | null }

const DAY_MS = 86_400_000

/** Số ngày lịch (theo giờ máy) từ `from` đến `to`. */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / DAY_MS)
}

export function expiryStatus(expiryDate: string | null, today: Date): ExpiryStatus {
  if (!expiryDate) return { kind: 'none', days: null }
  const days = calendarDaysBetween(today, parseLocalDate(expiryDate))
  if (Number.isNaN(days)) return { kind: 'none', days: null }
  if (days < 0) return { kind: 'expired', days }
  return { kind: days <= EXPIRY_SOON_DAYS ? 'soon' : 'ok', days }
}
