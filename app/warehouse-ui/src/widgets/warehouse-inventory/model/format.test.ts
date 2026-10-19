import { describe, expect, it } from 'vitest'
import { formatStock, thresholdRange } from './format'

describe('formatStock', () => {
  it('có đơn vị → "số đơn vị"', () => expect(formatStock(30, 'KG')).toBe('30 KG'))
  it('chưa có đơn vị (BE chưa trả) → chỉ số, không khoảng trắng thừa', () => {
    expect(formatStock(30, undefined)).toBe('30')
    expect(formatStock(30, '')).toBe('30')
  })
  it('số lẻ theo locale vi', () => expect(formatStock(1.5, 'KG')).toBe('1,5 KG'))
})

describe('thresholdRange', () => {
  it('cả hai 0 → null (Chưa đặt)', () => expect(thresholdRange(0, 0)).toBeNull())
  it('một bên 0 vẫn hiện', () => expect(thresholdRange(0, 70)).toBe('0 – 70'))
  it('bình thường', () => expect(thresholdRange(20, 70)).toBe('20 – 70'))
})
