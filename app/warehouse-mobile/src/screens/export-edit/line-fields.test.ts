import { priceToText, quantityToText, readPrice, readQuantity } from './line-fields'

describe('readQuantity (sheet sửa dòng: chỉ chặn chữ sai)', () => {
  it.each([
    ['', 0],
    ['  ', 0],
    ['0', 0],
    ['12', 12],
    ['7,5', 7.5],
    ['0,000001', 0.000001],
  ])('"%s" → %p', (text, value) => {
    expect(readQuantity(text)).toEqual({ value })
  })

  it.each([
    ['abc', 'quantityUnreadable'],
    ['-1', 'quantityUnreadable'],
    ['1,1234567', 'quantityUnreadable'],
    ['1000000000000', 'quantityTooLarge'],
  ])('"%s" → %s', (text, error) => {
    expect(readQuantity(text)).toEqual({ error })
  })
})

describe('readPrice (chữ đã ngăn nghìn theo locale)', () => {
  it('trống = null (chưa có giá — vẫn lưu được)', () => {
    expect(readPrice('', 'vi')).toEqual({ value: null })
  })
  it.each([
    ['1.250.000', 'vi', 1250000],
    ['1.250,5', 'vi', 1250.5],
    ['1,250.5', 'en', 1250.5],
    ['0', 'vi', 0],
  ] as const)('"%s" (%s) → %p', (text, locale, value) => {
    expect(readPrice(text, locale)).toEqual({ value })
  })
  it.each([
    ['1,234', 'unitPriceInvalid'],
    ['99.999.999.999.999.999', 'unitPriceTooLarge'],
  ])('"%s" → %s', (text, error) => {
    expect(readPrice(text, 'vi')).toEqual({ error })
  })
})

describe('chữ ban đầu của ô', () => {
  it('số lượng: 0 = chưa nhập → trống; dấu thập phân theo locale', () => {
    expect(quantityToText(0, ',')).toBe('')
    expect(quantityToText(2.5, ',')).toBe('2,5')
    expect(quantityToText(2.5, '.')).toBe('2.5')
  })
  it('đơn giá: null → trống; ngăn nghìn theo locale', () => {
    expect(priceToText(null, 'vi')).toBe('')
    expect(priceToText(1250000.5, 'vi')).toBe('1.250.000,5')
    expect(priceToText(1250000.5, 'en')).toBe('1,250,000.5')
  })
})
