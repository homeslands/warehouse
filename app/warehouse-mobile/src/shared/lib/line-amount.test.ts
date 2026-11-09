import { lineAmount, sumLineAmounts } from './line-amount'

describe('lineAmount', () => {
  it('số × đơn giá, làm tròn 2 số lẻ như `amount` của server', () => {
    expect(lineAmount(12.345678, 1.5)).toBe(18.52)
    expect(lineAmount(0.1, 0.2)).toBe(0.02)
  })

  it('đơn giá trống (`null`) tính 0', () => {
    expect(lineAmount(5, null)).toBe(0)
  })
})

describe('sumLineAmounts', () => {
  it('không có dòng → 0', () => {
    expect(sumLineAmounts([])).toBe(0)
  })

  it('làm tròn từng dòng rồi cộng dồn (server: total = Σ amount); giá trống = 0', () => {
    const lines = [1, 2, 3].map(() => ({ quantity: 0.001, unitPrice: 5 }))
    expect(sumLineAmounts([...lines, { quantity: 9, unitPrice: null }])).toBe(0.03)
  })
})
