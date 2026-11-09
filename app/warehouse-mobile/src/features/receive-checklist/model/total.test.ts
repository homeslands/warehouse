import { makeLine } from './fixtures'
import { linesTotal } from './total'

describe('linesTotal', () => {
  it('không có dòng → 0', () => {
    expect(linesTotal([])).toBe(0)
  })

  it('Σ số lượng × đơn giá', () => {
    const lines = [
      makeLine(1, { quantity: 120, unitPrice: 185_000 }),
      makeLine(2, { quantity: 48, unitPrice: 92_000 }),
      makeLine(3, { quantity: 0, unitPrice: 1_500 }),
    ]
    expect(linesTotal(lines)).toBe(120 * 185_000 + 48 * 92_000)
  })

  it('số lẻ: làm tròn 2 chữ số từng dòng như server, không rác dấu phẩy động', () => {
    // 0,1 × 0,2 = 0,020000000000000004 → 0,02; 12,345678 × 1,5 = 18,518517 → 18,52.
    const lines = [
      makeLine(1, { quantity: 0.1, unitPrice: 0.2 }),
      makeLine(2, { quantity: 12.345678, unitPrice: 1.5 }),
    ]
    expect(linesTotal(lines)).toBe(18.54)
  })

  it('làm tròn từng dòng trước khi cộng (server: amount = round2(q × p), total = Σ amount)', () => {
    // Mỗi dòng 0,005 → 0,01; cộng thô 3 dòng = 0,015 → 0,02 nếu chỉ tròn cuối.
    const lines = [1, 2, 3].map((n) => makeLine(n, { quantity: 0.001, unitPrice: 5 }))
    expect(linesTotal(lines)).toBe(0.03)
  })

  it('tổng lớn (≥ 1e12) giữ đúng', () => {
    const lines = Array.from({ length: 200 }, (_, i) =>
      makeLine(i + 1, { quantity: 1_000, unitPrice: 9_999_999.99 }),
    )
    expect(linesTotal(lines)).toBe(1_999_999_998_000)
  })
})
