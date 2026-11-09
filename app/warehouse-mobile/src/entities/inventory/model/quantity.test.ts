import { unit, item } from './fixtures'
import { altUnit, formatQuantity, toUnit } from './quantity'

describe('formatQuantity', () => {
  it('định dạng theo locale', () => {
    expect(formatQuantity(126.5, 'vi')).toBe('126,5')
    expect(formatQuantity(1250.5, 'en')).toBe('1,250.5')
    expect(formatQuantity(1250.5, 'vi')).toBe('1.250,5')
  })
  it('khử rác dấu phẩy động, tối đa 3 số thập phân', () => {
    expect(formatQuantity(0.1 + 0.2, 'vi')).toBe('0,3')
    expect(formatQuantity(1.234567, 'vi')).toBe('1,235')
    expect(formatQuantity(168, 'vi')).toBe('168')
  })
})

describe('toUnit', () => {
  it('chia theo conversionRate', () => {
    expect(toUnit(168, unit({ conversionRate: 20, isBaseUnit: false }))).toBe(8.4)
  })
  it('làm tròn 6 chữ số', () => {
    expect(toUnit(0.3, unit({ conversionRate: 0.1, isBaseUnit: false }))).toBe(3)
  })
})

describe('altUnit', () => {
  it('không có units → null', () => {
    expect(altUnit(item({ units: [] }))).toBeNull()
  })
  it('chỉ có đơn vị gốc → null', () => {
    expect(altUnit(item({ units: [unit()] }))).toBeNull()
  })
  it('ưu tiên conversionRate lớn nhất', () => {
    const ton = unit({ unitSlug: 'ton', unitName: 'tấn', conversionRate: 20, isBaseUnit: false })
    const thung = unit({
      unitSlug: 'thung',
      unitName: 'thùng',
      conversionRate: 5,
      isBaseUnit: false,
    })
    expect(altUnit(item({ units: [unit(), thung, ton] }))?.unitSlug).toBe('ton')
  })
})
