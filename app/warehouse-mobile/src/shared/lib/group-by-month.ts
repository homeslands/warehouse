import type { FormatLocale } from './format'

/** Phiếu có ngày tạo (ISO) — phiếu nhập / phiếu xuất đều thoả. */
export type Dated = { createdAt: string }
/** Một nhóm của `SectionList`: `key` = `YYYY-MM`. */
export type MonthGroup<T extends Dated> = { key: string; title: string; data: T[] }

const two = (n: number) => String(n).padStart(2, '0')

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** Tiêu đề nhóm tháng: vi "Tháng 11/2026", en "November 2026". */
export function monthTitle(day: Date, locale: FormatLocale): string {
  return locale === 'vi'
    ? `Tháng ${day.getMonth() + 1}/${day.getFullYear()}`
    : `${MONTHS_EN[day.getMonth()]} ${day.getFullYear()}`
}

/**
 * Gom phiếu (đã sắp createdAt giảm dần như API trả) theo THÁNG của `createdAt` giờ máy — danh sách kiểu
 * lịch sử giao dịch: ít tiêu đề, ngày nằm trong dòng (`formatDayMonth`). Chỉ gộp các phiếu liền nhau cùng
 * tháng, nên một tháng bị cắt giữa hai trang vẫn thành một nhóm.
 */
export function groupFormsByMonth<T extends Dated>(
  forms: T[],
  locale: FormatLocale,
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = []
  for (const f of forms) {
    const day = new Date(f.createdAt)
    const key = `${day.getFullYear()}-${two(day.getMonth() + 1)}`
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.data.push(f)
    else groups.push({ key, title: monthTitle(day, locale), data: [f] })
  }
  return groups
}
