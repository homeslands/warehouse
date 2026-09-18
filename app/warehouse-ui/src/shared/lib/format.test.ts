import { afterEach, describe, expect, it } from 'vitest'
import i18n from '@/shared/i18n'
import { formatCurrency, formatDate, formatDateTime, formatNumber } from './format'

// Intl chèn khoảng trắng không ngắt (U+00A0) trước "₫" — chuẩn hoá để so chuỗi.
const plain = (s: string) => s.replace(/\s/g, ' ')

// Tạo từ giờ địa phương → kết quả không phụ thuộc múi giờ của máy chạy test.
const localDate = new Date(2026, 8, 18, 8, 5)

afterEach(async () => {
  await i18n.changeLanguage('vi')
})

describe('format — tiếng Việt (mặc định của test)', () => {
  it('số', () => {
    expect(formatNumber(1234567.5)).toBe('1.234.567,5')
  })

  it('tiền VND, không chữ số lẻ', () => {
    expect(plain(formatCurrency(1234567.5))).toBe('1.234.568 ₫')
  })

  it('ngày dd/MM/yyyy', () => {
    expect(formatDate(localDate)).toBe('18/09/2026')
  })

  it('ngày giờ dd/MM/yyyy HH:mm', () => {
    expect(formatDateTime(localDate.toISOString())).toBe('18/09/2026 08:05')
  })

  it('chuỗi YYYY-MM-DD hiểu theo giờ địa phương, không lùi ngày', () => {
    expect(formatDate('2026-09-18')).toBe('18/09/2026')
  })
})

describe('format — tiếng Anh', () => {
  it('số, tiền, ngày theo en-US', async () => {
    await i18n.changeLanguage('en')
    expect(formatNumber(1234567.5)).toBe('1,234,567.5')
    expect(plain(formatCurrency(1234567.5))).toBe('₫1,234,568')
    expect(formatDate(localDate)).toBe('09/18/2026')
    expect(formatDateTime(localDate)).toBe('09/18/2026 08:05')
  })
})

describe('giá trị rỗng/không hợp lệ → —', () => {
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])('formatNumber(%s)', (v) => {
    expect(formatNumber(v)).toBe('—')
    expect(formatCurrency(v)).toBe('—')
  })

  it.each([null, undefined, '', 'không phải ngày', Number.NaN])('formatDate(%s)', (v) => {
    expect(formatDate(v)).toBe('—')
    expect(formatDateTime(v)).toBe('—')
  })
})
