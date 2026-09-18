import i18n from '@/shared/i18n'

/** Hiện cho giá trị rỗng/không hợp lệ — một ô trống trông như lỗi hiển thị. */
export const EMPTY_VALUE = '—'

type DateInput = string | number | Date | null | undefined

function currentLocale(): string {
  return i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN'
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') {
    // `new Date('2026-09-18')` hiểu là 00:00 UTC → ở múi giờ âm lùi sang ngày hôm trước.
    // Ngày không giờ (giá trị của DatePicker) phải hiểu theo giờ địa phương.
    const match = DATE_ONLY.exec(value)
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Hàm thuần, đọc ngôn ngữ lúc gọi. Component dùng chúng phải gọi `useTranslation()` để render lại
 * khi đổi ngôn ngữ.
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_VALUE
  return new Intl.NumberFormat(currentLocale()).format(value)
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_VALUE
  return new Intl.NumberFormat(currentLocale(), {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(value: DateInput): string {
  const date = toDate(value)
  if (!date) return EMPTY_VALUE
  return new Intl.DateTimeFormat(currentLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatDateTime(value: DateInput): string {
  const date = toDate(value)
  if (!date) return EMPTY_VALUE
  // Ghép ngày + giờ thay vì để Intl tự xếp: vi-VN mặc định đặt giờ TRƯỚC ngày ("08:05 18/09/2026").
  const time = new Intl.DateTimeFormat(currentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  return `${formatDate(date)} ${time}`
}
