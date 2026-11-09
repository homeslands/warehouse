import type { InventoryItem, MaterialBatch } from '@/entities/inventory'

import { makeLine } from './fixtures'
import { availableInLineUnit } from './stock'

const stock = (availableQuantity: number): InventoryItem =>
  ({ materialSlug: 'm-1', availableQuantity }) as InventoryItem
const batch = (slug: string, availableQuantity: number): MaterialBatch =>
  ({ slug, materialSlug: 'm-1', availableQuantity }) as MaterialBatch

describe('availableInLineUnit', () => {
  it('đơn vị gốc: bằng khả dụng của tồn', () => {
    expect(availableInLineUnit(makeLine(1), stock(100), undefined, [])).toBe(100)
  })

  it('đơn vị khác gốc: 1 thùng = 24 hộp, tồn 100 hộp → còn 4,166666 thùng (làm tròn XUỐNG)', () => {
    const line = makeLine(1, { unitName: 'thùng', conversionRate: 24 })
    expect(availableInLineUnit(line, stock(100), undefined, [])).toBe(4.166666)
  })

  it('chia hết không bị hạ oan vì sai số dấu phẩy động (0,3 / 0,1 = 3)', () => {
    const line = makeLine(1, { conversionRate: 0.1 })
    expect(availableInLineUnit(line, stock(0.3), undefined, [])).toBe(3)
  })

  it('hai dòng cùng vật tư trừ lẫn nhau (quy về gốc)', () => {
    const a = makeLine(1, { unitSlug: 'thung', conversionRate: 24, quantity: 2 })
    const b = makeLine(1, { unitSlug: 'hop', conversionRate: 1, quantity: 30 })
    // a: 100 - 30 = 70 hộp = 2,916666… thùng (làm tròn xuống); b: 100 - 48 = 52 hộp
    expect(availableInLineUnit(a, stock(100), undefined, [a, b])).toBe(2.916666)
    expect(availableInLineUnit(b, stock(100), undefined, [a, b])).toBe(52)
  })

  it('dòng của vật tư khác không bị trừ', () => {
    const other = makeLine(2, { quantity: 50 })
    expect(availableInLineUnit(makeLine(1), stock(100), undefined, [other])).toBe(100)
  })

  it('không âm khi các dòng khác đã vượt tồn', () => {
    const other = makeLine(1, { unitSlug: 'x', quantity: 500 })
    expect(availableInLineUnit(makeLine(1), stock(100), undefined, [other])).toBe(0)
  })

  it('lô đã chọn dùng khả dụng của lô và chỉ trừ dòng khác cùng lô', () => {
    const line = makeLine(1, { batchSlug: 'b1' })
    const sameLot = makeLine(1, { unitSlug: 'x', batchSlug: 'b1', quantity: 5 })
    const otherLot = makeLine(1, { unitSlug: 'y', batchSlug: 'b2', quantity: 7 })
    const auto = makeLine(1, { unitSlug: 'z', quantity: 9 })
    expect(availableInLineUnit(line, stock(100), batch('b1', 20), [sameLot, otherLot, auto])).toBe(
      15,
    )
  })

  it('dòng chọn lô mà chưa có dữ liệu lô (hoặc sai lô) → null', () => {
    const line = makeLine(1, { batchSlug: 'b1' })
    expect(availableInLineUnit(line, stock(100), undefined, [])).toBeNull()
    expect(availableInLineUnit(line, stock(100), batch('b2', 5), [])).toBeNull()
  })

  it('không có tồn → null', () => {
    expect(availableInLineUnit(makeLine(1), undefined, undefined, [])).toBeNull()
  })
})
