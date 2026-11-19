import {
  formatMoney,
  formatMoneyCompact,
  formatQuantity,
  formatEntryDate,
  formatFullDate,
  formatShortDate,
  formatDayMonth,
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

describe('formatMoneyCompact', () => {
  it.each([
    [125_400_000, 'vi', '125,4 tr đ'],
    [1_250_000_000, 'vi', '1,25 tỷ đ'],
    [3_104_400, 'vi', '3,1 tr đ'],
    [999_999_999, 'vi', '1 tỷ đ'],
    [120_000_000, 'vi', '120 tr đ'],
    [125_400_000, 'en', '125.4M đ'],
    [1_250_000_000, 'en', '1.25B đ'],
    [3_104_400, 'en', '3.1M đ'],
  ] as const)('%d (%s) → %s', (v, l, out) => {
    expect(formatMoneyCompact(v, l)).toBe(out)
  })

  it('dưới 1 triệu = formatMoney đầy đủ', () => {
    expect(formatMoneyCompact(4440, 'vi')).toBe(formatMoney(4440, 'vi'))
    expect(formatMoneyCompact(850_000, 'vi')).toBe(formatMoney(850_000, 'vi'))
    expect(formatMoneyCompact(999_999, 'vi')).toBe(formatMoney(999_999, 'vi'))
    expect(formatMoneyCompact(500, 'vi')).toBe(formatMoney(500, 'vi'))
    expect(formatMoneyCompact(0, 'vi')).toBe('0 đ')
  })

  it('số âm giữ đúng dấu của formatMoney', () => {
    const sign = formatMoney(-5, 'vi').charAt(0)
    expect(formatMoneyCompact(-27_200_000, 'vi')).toBe(`${sign}27,2 tr đ`)
    expect(formatMoneyCompact(-999_999, 'vi')).toBe(formatMoney(-999_999, 'vi'))
  })
})

describe('formatDayMonth', () => {
  it('dd/MM theo giờ máy của mốc ISO; không đọc được → rỗng', () => {
    expect(formatDayMonth(new Date(2026, 10, 5, 23, 59).toISOString())).toBe('05/11')
    expect(formatDayMonth(new Date(2026, 0, 1, 0, 1).toISOString())).toBe('01/01')
    expect(formatDayMonth('không phải ngày')).toBe('')
  })
})
