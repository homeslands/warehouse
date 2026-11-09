import { item } from './fixtures'
import { isOverMaximum, stockLevel } from './stock-level'

describe('stockLevel', () => {
  it('quantity 0 là out kể cả khi isBelowMinimum', () => {
    expect(stockLevel(item({ quantity: 0, isBelowMinimum: true }))).toBe('out')
  })
  it('dưới mức tối thiểu là low', () => {
    expect(stockLevel(item({ quantity: 168, isBelowMinimum: true }))).toBe('low')
  })
  it('trên mức tối đa là high', () => {
    expect(stockLevel(item({ quantity: 96, isAboveMaximum: true }))).toBe('high')
  })
  it('max thực áp 0 (chưa đặt) thì BE báo vượt cũng không phải high', () => {
    const it0 = item({ quantity: 5, isAboveMaximum: true, effectiveMaximumInventory: 0 })
    expect(stockLevel(it0)).toBe('ok')
    expect(isOverMaximum(it0)).toBe(false)
  })
  it('max 100, qty 150 là high', () => {
    const it1 = item({ quantity: 150, isAboveMaximum: true, effectiveMaximumInventory: 100 })
    expect(stockLevel(it1)).toBe('high')
    expect(isOverMaximum(it1)).toBe(true)
  })
  it('còn lại là ok', () => {
    expect(stockLevel(item({ quantity: 42 }))).toBe('ok')
  })
})
