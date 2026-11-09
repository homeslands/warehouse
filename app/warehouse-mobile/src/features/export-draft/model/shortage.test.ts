import type { InventoryItem, MaterialBatch } from '@/entities/inventory'

import { makeLine } from './fixtures'
import { detectShortages } from './shortage'
import { availableInLineUnit } from './stock'

const stock = (available: number, slug = 'm-1') =>
  ({ materialSlug: slug, availableQuantity: available }) as InventoryItem

const batch = (
  slug: string,
  available: number,
  expiryDate: string | null,
  entryDate = '2026-01-01',
) =>
  ({
    slug,
    availableQuantity: available,
    expiryDate,
    entryDate,
    materialSlug: 'm-1',
  }) as MaterialBatch

const run = (lines: ReturnType<typeof makeLine>[], available: number, batches: MaterialBatch[]) =>
  detectShortages(lines, new Map([['m-1', stock(available)]]), new Map([['m-1', batches]]))

describe('detectShortages', () => {
  it('đủ hàng → map rỗng', () => {
    const l = makeLine(1, { quantity: 10 })
    expect(run([l], 50, [batch('a', 50, '2027-01-01')]).size).toBe(0)
  })

  it('dòng tự động thiếu 20 hộp', () => {
    const l = makeLine(1, { quantity: 50 })
    const r = run([l], 30, [batch('a', 30, '2027-01-01')])
    expect(r.get(l.key)).toEqual({ kind: 'stock', missing: 20 })
  })

  it('dòng chọn lô vượt lô còn 12 → batch/12', () => {
    const l = makeLine(1, { quantity: 20, batchSlug: 'a' })
    const r = run([l], 100, [batch('a', 12, '2027-01-01'), batch('b', 88, '2027-06-01')])
    expect(r.get(l.key)).toEqual({ kind: 'batch', available: 12 })
  })

  it('lô chỉ định bị trừ trước nên dòng tự động thiếu', () => {
    const auto = makeLine(1, { unitSlug: 'u-a', quantity: 8 })
    const picked = makeLine(1, { unitSlug: 'u-b', quantity: 10, batchSlug: 'a' })
    const r = run([auto, picked], 100, [batch('a', 12, '2027-01-01')])
    expect(r.has(picked.key)).toBe(false)
    expect(r.get(auto.key)).toEqual({ kind: 'stock', missing: 6 })
  })

  it('hai đơn vị khác nhau cộng dồn theo đơn vị gốc', () => {
    const box = makeLine(1, { unitSlug: 'box', conversionRate: 12, quantity: 1 })
    const piece = makeLine(1, { unitSlug: 'pc', conversionRate: 1, quantity: 6 })
    const r = run([box, piece], 15, [batch('a', 15, null)])
    expect(r.has(box.key)).toBe(false)
    expect(r.get(piece.key)).toEqual({ kind: 'stock', missing: 3 })
  })

  it('đơn vị lớn: số thiếu quy về đơn vị dòng', () => {
    const box = makeLine(1, { unitSlug: 'box', conversionRate: 12, quantity: 2 })
    const r = run([box], 18, [batch('a', 18, null)])
    expect(r.get(box.key)).toEqual({ kind: 'stock', missing: 0.5 })
  })

  it('lô không HSD dùng sau cùng', () => {
    const l1 = makeLine(1, { unitSlug: 'u-a', quantity: 10 })
    const l2 = makeLine(1, { unitSlug: 'u-b', quantity: 10 })
    const pick = makeLine(1, { unitSlug: 'u-c', quantity: 10, batchSlug: 'dated' })
    // dated=10 bị dòng chọn lô lấy hết; còn lô không HSD 10 cho l1, l2 thiếu.
    const r = run([l1, l2, pick], 100, [batch('none', 10, null), batch('dated', 10, '2027-01-01')])
    expect(r.has(l1.key)).toBe(false)
    expect(r.get(l2.key)).toEqual({ kind: 'stock', missing: 10 })
    // FEFO: dòng tự động lấy lô có HSD trước
    const auto = makeLine(1, { quantity: 10 })
    const picked = makeLine(1, { unitSlug: 'u-z', quantity: 10, batchSlug: 'none' })
    expect(
      run([auto, picked], 100, [batch('none', 10, null), batch('dated', 10, '2027-01-01')]).size,
    ).toBe(0)
  })

  it('tồn nhỏ hơn tổng lô → thiếu gán vào dòng cuối', () => {
    const l1 = makeLine(1, { unitSlug: 'u-a', quantity: 10 })
    const l2 = makeLine(1, { unitSlug: 'u-b', quantity: 10 })
    const r = run([l1, l2], 15, [batch('a', 100, '2027-01-01')])
    expect(r.has(l1.key)).toBe(false)
    expect(r.get(l2.key)).toEqual({ kind: 'stock', missing: 5 })
  })

  it('số lẻ 6 chữ số không sinh thiếu ảo (0.1 + 0.2)', () => {
    const l1 = makeLine(1, { unitSlug: 'u-a', quantity: 0.1 })
    const l2 = makeLine(1, { unitSlug: 'u-b', quantity: 0.2 })
    expect(run([l1, l2], 0.3, [batch('a', 0.3, null)]).size).toBe(0)
  })

  it('vật tư tách riêng nhau', () => {
    const a = makeLine(1, { quantity: 5 })
    const b = makeLine(2, { quantity: 5 })
    const r = detectShortages(
      [a, b],
      new Map([
        ['m-1', stock(10, 'm-1')],
        ['m-2', stock(2, 'm-2')],
      ]),
      new Map([
        ['m-1', [batch('a', 10, null)]],
        ['m-2', [batch('b', 2, null)]],
      ]),
    )
    expect(r.has(a.key)).toBe(false)
    expect(r.get(b.key)).toEqual({ kind: 'stock', missing: 3 })
  })
  describe('làm tròn theo đơn vị dòng (1 thùng = 24 hộp, còn 100 hộp)', () => {
    const thung = (over: Partial<Parameters<typeof makeLine>[1]> = {}) =>
      makeLine(1, { unitSlug: 'thung', unitName: 'thùng', conversionRate: 24, ...over })

    it('nhập đúng số "còn n" app hiện thì không bao giờ thiếu (lô tự động)', () => {
      const shown = availableInLineUnit(thung(), stock(100), undefined, [])!
      const l = thung({ quantity: shown })
      expect(run([l], 100, [batch('a', 100, '2027-01-01')]).size).toBe(0)
    })

    it('nhập đúng số "còn n" của lô đã chọn thì không thiếu', () => {
      const lot = batch('a', 100, '2027-01-01')
      const shown = availableInLineUnit(thung({ batchSlug: 'a' }), stock(100), lot, [])!
      const l = thung({ quantity: shown, batchSlug: 'a' })
      expect(run([l], 100, [lot]).size).toBe(0)
    })

    it('thiếu rất nhỏ (4,166667 thùng = 100,000008 hộp) báo ≥ 0,000001 chứ không phải 0', () => {
      const l = thung({ quantity: 4.166667 })
      expect(run([l], 100, [batch('a', 100, '2027-01-01')]).get(l.key)).toEqual({
        kind: 'stock',
        missing: 0.000001,
      })
    })

    it('thiếu rất nhỏ ở cấp tồn (lô đủ, tồn thiếu) cũng ≥ 0,000001', () => {
      const l = thung({ quantity: 4.166667 })
      expect(run([l], 100, [batch('a', 200, '2027-01-01')]).get(l.key)).toEqual({
        kind: 'stock',
        missing: 0.000001,
      })
    })

    it('số thiếu làm tròn LÊN', () => {
      // 5 thùng = 120 hộp, thiếu 20 hộp = 0,8333… thùng → 0,833334
      const l = thung({ quantity: 5 })
      expect(run([l], 100, [batch('a', 100, null)]).get(l.key)).toEqual({
        kind: 'stock',
        missing: 0.833334,
      })
    })

    it('"lô chỉ còn n" làm tròn XUỐNG', () => {
      const l = thung({ quantity: 5, batchSlug: 'a' })
      expect(run([l], 200, [batch('a', 100, null)]).get(l.key)).toEqual({
        kind: 'batch',
        available: 4.166666,
      })
    })
  })
})
