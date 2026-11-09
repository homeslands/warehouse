import { formatMoneyInput, parseMoneyInput } from './money-input'

describe('formatMoneyInput', () => {
  it.each([
    ['1250000', 'vi', '1.250.000'],
    ['12,', 'vi', '12,'],
    ['12,345', 'vi', '12,34'],
    ['0007', 'vi', '7'],
    ['abc', 'vi', ''],
    ['', 'vi', ''],
    ['1250000.5', 'en', '1,250,000.5'],
    ['12.', 'vi', '12'],
    ['1.250.', 'vi', '1.250'],
    ['1.250.000', 'vi', '1.250.000'],
    ['12,', 'en', '12'],
    ['1,250,', 'en', '1,250'],
    ['12,5.', 'vi', '12,5'],
  ] as const)('%s (%s) -> %s', (typed, locale, out) => {
    expect(formatMoneyInput(typed, locale)).toBe(out)
  })

  it('keeps a single typed decimal separator and leading zero before it', () => {
    expect(formatMoneyInput('0,5', 'vi')).toBe('0,5')
    expect(formatMoneyInput('1,2,3', 'vi')).toBe('1,23')
  })
})

describe('formatMoneyInput typed char by char', () => {
  const type = (chars: string, locale: 'vi' | 'en') => {
    let text = ''
    for (const ch of chars) text = formatMoneyInput(text + ch, locale)
    return text
  }

  it('vi: "." KHÔNG BAO GIỜ là dấu thập phân — "1.250" gõ từng chữ → "1.250" = 1250 (không phải 1,25)', () => {
    expect(type('1.250', 'vi')).toBe('1.250')
    expect(parseMoneyInput(type('1.250', 'vi'), 'vi')).toEqual({ value: 1250 })
    expect(type('12.5', 'vi')).toBe('125')
  })

  it('en: "," KHÔNG BAO GIỜ là dấu thập phân — "1,250" → 1250', () => {
    expect(type('1,250', 'en')).toBe('1,250')
    expect(parseMoneyInput(type('1,250', 'en'), 'en')).toEqual({ value: 1250 })
  })

  it('chỉ dấu thập phân của locale mở phần lẻ: vi "12,5" → 12,5; en "12.5" → 12.5', () => {
    expect(type('12,5', 'vi')).toBe('12,5')
    expect(type('12.5', 'en')).toBe('12.5')
  })
})

describe('parseMoneyInput', () => {
  it.each([
    ['1.250', 'vi', 1250],
    ['1.250.000', 'vi', 1250000],
    ['12,5', 'vi', 12.5],
    ['1,250', 'en', 1250],
  ] as const)('%s (%s) -> %d', (text, locale, value) => {
    expect(parseMoneyInput(text, locale)).toEqual({ value })
  })

  it('empty is null', () => {
    expect(parseMoneyInput('', 'vi')).toEqual({ value: null })
  })
  it('rejects garbage, too many decimals and huge numbers', () => {
    expect(parseMoneyInput('1e20', 'vi')).toEqual({ error: 'invalid' })
    expect(parseMoneyInput('1,234', 'vi')).toEqual({ error: 'tooManyDecimals' })
    expect(parseMoneyInput('99999999999999999', 'vi')).toEqual({ error: 'tooLarge' })
  })
})
