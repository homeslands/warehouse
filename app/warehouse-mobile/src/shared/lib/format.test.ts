import {
  formatMoney,
  formatQuantity,
  formatEntryDate,
  formatFullDate,
  formatShortDate,
  formatTime,
  parseDecimalInput,
  todayLocalIso,
} from './format'

describe('formatMoney', () => {
  it('vi: dấu chấm ngăn nghìn + " đ" ở cuối', () => {
    expect(formatMoney(46176000, 'vi')).toBe('46.176.000 đ')
  })

  it('en: dấu phẩy ngăn nghìn, vẫn " đ" ở cuối (chuẩn chung của app)', () => {
    expect(formatMoney(46176000, 'en')).toBe('46,176,000 đ')
  })

  it('số rất lớn không ra ký hiệu khoa học', () => {
    expect(formatMoney(1e13, 'vi')).not.toMatch(/e/i)
    expect(formatMoney(1e13, 'vi')).toContain('10.000.000.000.000')
  })

  it('làm tròn về số nguyên', () => {
    expect(formatMoney(1234.56, 'en')).toBe('1,235 đ')
  })
})

describe('formatQuantity', () => {
  it('tối đa 3 số lẻ theo ngôn ngữ', () => {
    expect(formatQuantity(1234.5678, 'vi')).toBe('1.234,568')
    expect(formatQuantity(1234.5678, 'en')).toBe('1,234.568')
  })
})

describe('formatShortDate', () => {
  it('dd/MM/yy; không đọc được thì trả nguyên văn', () => {
    expect(formatShortDate('2026-11-04')).toBe('04/11/26')
    expect(formatShortDate('abc')).toBe('abc')
  })
})

describe('formatFullDate', () => {
  it('dd/MM/yyyy (năm 4 chữ số, cùng thứ tự cho vi lẫn en như formatShortDate); không đọc được thì trả nguyên văn', () => {
    expect(formatFullDate('2026-11-05')).toBe('05/11/2026')
    expect(formatFullDate('0999-01-02')).toBe('02/01/0999')
    expect(formatFullDate('abc')).toBe('abc')
  })
})

describe('parseDecimalInput', () => {
  it('nhận dấu phẩy hoặc chấm', () => {
    expect(parseDecimalInput('12,5')).toBe(12.5)
    expect(parseDecimalInput(' 12.345678 ')).toBe(12.345678)
    expect(parseDecimalInput('0')).toBe(0)
  })

  it('bỏ khoảng trắng bên trong', () => {
    expect(parseDecimalInput('1 2,5')).toBe(12.5)
  })

  it('quá maxScale số lẻ → null', () => {
    expect(parseDecimalInput('1,2345678')).toBeNull()
    expect(parseDecimalInput('1,234', 2)).toBeNull()
    expect(parseDecimalInput('1,23', 2)).toBe(1.23)
  })

  it('rỗng / không hợp lệ / âm → null', () => {
    expect(parseDecimalInput('')).toBeNull()
    expect(parseDecimalInput('   ')).toBeNull()
    expect(parseDecimalInput('-1')).toBeNull()
    expect(parseDecimalInput('abc')).toBeNull()
    expect(parseDecimalInput('1,2,3')).toBeNull()
    expect(parseDecimalInput('1e3')).toBeNull()
  })
})

describe('todayLocalIso', () => {
  it('YYYY-MM-DD theo giờ máy', () => {
    expect(todayLocalIso(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04')
    expect(todayLocalIso(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
  })
})

describe('formatTime', () => {
  it('HH:mm theo giờ máy, có đệm 0', () => {
    expect(formatTime(new Date(2026, 10, 5, 9, 5).toISOString())).toBe('09:05')
    expect(formatTime(new Date(2026, 10, 5, 23, 59).toISOString())).toBe('23:59')
    expect(formatTime(new Date(2026, 10, 5, 0, 1).toISOString())).toBe('00:01')
  })
  it('không đọc được → rỗng', () => {
    expect(formatTime('không phải ngày')).toBe('')
  })
})

describe('formatEntryDate', () => {
  const now = new Date(2026, 10, 8)
  it('cùng năm với now → dd/MM', () => {
    expect(formatEntryDate('2026-10-05', now)).toBe('05/10')
  })
  it('khác năm → dd/MM/yyyy', () => {
    expect(formatEntryDate('2025-10-05', now)).toBe('05/10/2025')
  })
  it('không đọc được → null', () => {
    expect(formatEntryDate('abc', now)).toBeNull()
  })
})
