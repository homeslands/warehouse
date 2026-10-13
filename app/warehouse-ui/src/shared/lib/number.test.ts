import { describe, expect, it } from 'vitest'
import { hasAtMostDecimals, roundMoney } from './number'

describe('hasAtMostDecimals', () => {
  it.each([0, 1, 1.5, 0.123456, 1.000001, 50])('%s có ≤ 6 số lẻ', (v) => {
    expect(hasAtMostDecimals(v, 6)).toBe(true)
  })
  it.each([0.1234567, 1e-7, 1.0000001])('%s có > 6 số lẻ', (v) => {
    expect(hasAtMostDecimals(v, 6)).toBe(false)
  })
  it('n = 2 (tiền)', () => {
    expect(hasAtMostDecimals(1.25, 2)).toBe(true)
    expect(hasAtMostDecimals(1.255, 2)).toBe(false)
  })
})

describe('roundMoney', () => {
  it('làm tròn 2 số lẻ, khử sai số dấu phẩy động', () => {
    expect(roundMoney(0.1 * 3)).toBe(0.3)
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(10 * 375000)).toBe(3750000)
  })
})
