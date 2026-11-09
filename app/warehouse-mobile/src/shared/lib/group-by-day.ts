import type { FormatLocale } from './format'

/** Phiếu có ngày tạo (ISO) — phiếu nhập / phiếu xuất đều thoả. */
export type Dated = { createdAt: string }
export type DayGroup<T extends Dated> = { key: string; title: string; data: T[] }
export type DayLabels = { today: string; yesterday: string }

const WEEKDAYS: Record<FormatLocale, string[]> = {
  vi: ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
}

const two = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`

/**
 * Tiêu đề nhóm ngày (giờ máy): "Hôm nay", "Hôm qua", cùng năm "Thứ Hai, 03/11", năm cũ "03/11/2025".
 */
export function dayTitle(day: Date, now: Date, locale: FormatLocale, labels: DayLabels): string {
  const key = dayKey(day)
  if (key === dayKey(now)) return labels.today
  if (key === dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)))
    return labels.yesterday
  const dm = `${two(day.getDate())}/${two(day.getMonth() + 1)}`
  if (day.getFullYear() !== now.getFullYear()) return `${dm}/${day.getFullYear()}`
  return `${WEEKDAYS[locale][day.getDay()]}, ${dm}`
}

/**
 * Gom phiếu (đã sắp createdAt giảm dần như API trả) theo NGÀY của `createdAt` giờ máy. Chỉ gộp các
 * phiếu liền nhau cùng ngày, nên một ngày bị cắt giữa hai trang vẫn thành một nhóm.
 */
export function groupFormsByDay<T extends Dated>(
  forms: T[],
  now: Date,
  locale: FormatLocale,
  labels: DayLabels,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const f of forms) {
    const day = new Date(f.createdAt)
    const key = dayKey(day)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.data.push(f)
    else groups.push({ key, title: dayTitle(day, now, locale, labels), data: [f] })
  }
  return groups
}
