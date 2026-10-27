import { describe, expect, it } from 'vitest'
import { findShortages } from './availability'
import { EMPTY_EXPORT_ITEM, type ExportFormItemValues } from './export-form-editor.schema'

const line = (over: Partial<ExportFormItemValues>): ExportFormItemValues => ({
  ...EMPTY_EXPORT_ITEM,
  ...over,
})

const stockOf = (availableQuantity: number) => ({
  availableQuantity,
  baseUnit: { slug: 'chai', code: 'CHAI', name: 'Chai' },
  units: [
    { unitSlug: 'chai', unitCode: 'CHAI', unitName: 'Chai', conversionRate: 1, isBaseUnit: true },
    {
      unitSlug: 'thung',
      unitCode: 'THUNG',
      unitName: 'Thùng',
      conversionRate: 24,
      isBaseUnit: false,
    },
  ],
})

describe('findShortages', () => {
  it('quy THUNG về CHAI rồi so khả dụng của vật tư', () => {
    const stock = new Map([['m1', stockOf(100)]])
    expect(
      findShortages(
        [line({ materialSlug: 'm1', unitSlug: 'thung', quantity: 5 })],
        stock,
        new Map(),
      ),
    ).toEqual([{ index: 0, available: 100, requested: 120, baseUnitCode: 'CHAI' }])
  })

  it('đủ hàng thì không có thiếu', () => {
    const stock = new Map([['m1', stockOf(120)]])
    expect(
      findShortages(
        [line({ materialSlug: 'm1', unitSlug: 'thung', quantity: 5 })],
        stock,
        new Map(),
      ),
    ).toEqual([])
  })

  it('cộng dồn hai dòng cùng lô: cả hai dòng đều báo', () => {
    const stock = new Map([['m1', stockOf(1000)]])
    const batches = new Map([['b1', { availableQuantity: 50 }]])
    const items = [
      line({ materialSlug: 'm1', unitSlug: 'chai', quantity: 30, batchSlug: 'b1' }),
      line({ materialSlug: 'm1', unitSlug: 'thung', quantity: 1, batchSlug: 'b1' }),
    ]
    expect(findShortages(items, stock, batches)).toEqual([
      { index: 0, available: 50, requested: 54, baseUnitCode: 'CHAI' },
      { index: 1, available: 50, requested: 54, baseUnitCode: 'CHAI' },
    ])
  })

  it('cộng dồn hai dòng tự chọn lô cùng vật tư', () => {
    const stock = new Map([['m1', stockOf(50)]])
    const items = [
      line({ materialSlug: 'm1', unitSlug: 'chai', quantity: 30 }),
      line({ materialSlug: 'm1', unitSlug: 'chai', quantity: 30 }),
    ]
    expect(findShortages(items, stock, new Map()).map((s) => s.index)).toEqual([0, 1])
  })

  it('dòng có lô vẫn tính vào tổng vật tư', () => {
    const stock = new Map([['m1', stockOf(70)]])
    const batches = new Map([['b1', { availableQuantity: 80 }]])
    const items = [line({ materialSlug: 'm1', unitSlug: 'chai', quantity: 75, batchSlug: 'b1' })]
    expect(findShortages(items, stock, batches)).toEqual([
      { index: 0, available: 70, requested: 75, baseUnitCode: 'CHAI' },
    ])
  })

  it('thiếu cả hai nhóm thì báo nhóm chặt hơn (available nhỏ hơn)', () => {
    const stock = new Map([['m1', stockOf(70)]])
    const batches = new Map([['b1', { availableQuantity: 10 }]])
    const items = [line({ materialSlug: 'm1', unitSlug: 'chai', quantity: 75, batchSlug: 'b1' })]
    expect(findShortages(items, stock, batches)).toEqual([
      { index: 0, available: 10, requested: 75, baseUnitCode: 'CHAI' },
    ])
  })

  it('chỉ dòng thuộc nhóm vượt bị báo, kết quả theo thứ tự dòng', () => {
    const stock = new Map([['m1', stockOf(1000)]])
    const batches = new Map([
      ['b1', { availableQuantity: 5 }],
      ['b2', { availableQuantity: 500 }],
    ])
    const items = [
      line({ materialSlug: 'm1', unitSlug: 'chai', quantity: 1, batchSlug: 'b2' }),
      line({ materialSlug: 'm1', unitSlug: 'chai', quantity: 6, batchSlug: 'b1' }),
    ]
    expect(findShortages(items, stock, batches).map((s) => s.index)).toEqual([1])
  })

  it('dòng chưa đủ thông tin bị bỏ qua', () => {
    const stock = new Map([['m1', stockOf(1)]])
    const items = [
      line({}),
      line({ materialSlug: 'm1', unitSlug: '', quantity: 5 }),
      line({ materialSlug: 'm1', unitSlug: 'chai' }),
      line({ materialSlug: 'm1', unitSlug: 'chai', quantity: 0 }),
      line({ materialSlug: 'zzz', unitSlug: 'chai', quantity: 5 }),
    ]
    expect(findShortages(items, stock, new Map())).toEqual([])
  })

  it('làm tròn 6 số lẻ để tránh sai số float', () => {
    const stock = new Map([['m1', stockOf(0.3)]])
    const items = [
      line({ materialSlug: 'm1', unitSlug: 'chai', quantity: 0.1 }),
      line({ materialSlug: 'm1', unitSlug: 'chai', quantity: 0.2 }),
    ]
    expect(findShortages(items, stock, new Map())).toEqual([])
  })

  it('baseUnitCode null khi vật tư không có đơn vị gốc', () => {
    const stock = new Map([['m1', { ...stockOf(1), baseUnit: null }]])
    expect(
      findShortages(
        [line({ materialSlug: 'm1', unitSlug: 'chai', quantity: 5 })],
        stock,
        new Map(),
      )[0].baseUnitCode,
    ).toBeNull()
  })
})
