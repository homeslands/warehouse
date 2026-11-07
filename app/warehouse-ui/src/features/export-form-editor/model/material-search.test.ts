import { describe, expect, it } from 'vitest'
import type { InventoryItem } from '@/entities/inventory'
import { baseUnitSlugOf, filterStock } from './material-search'

const item = (code: string, name: string, extra: Partial<InventoryItem> = {}): InventoryItem =>
  ({
    slug: `m-${code}`,
    materialSlug: `m-${code}`,
    materialCode: code,
    materialName: name,
    availableQuantity: 5,
    baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
    units: [
      {
        unitSlug: 'u-kg',
        unitCode: 'KG',
        unitName: 'Kilogram',
        conversionRate: 1,
        isBaseUnit: true,
      },
    ],
    ...extra,
  }) as InventoryItem

const STOCK = [
  item('VT-01', 'Bột mì'),
  item('VT-02', 'Đường cát'),
  item('XM-09', 'Xi măng Hà Tiên'),
]

describe('filterStock', () => {
  it('khớp mã, không phân biệt hoa thường', () => {
    expect(filterStock(STOCK, 'vt-0').map((i) => i.materialCode)).toEqual(['VT-01', 'VT-02'])
  })
  it('khớp tên, bỏ dấu', () => {
    expect(filterStock(STOCK, 'duong').map((i) => i.materialCode)).toEqual(['VT-02'])
    expect(filterStock(STOCK, 'ha tien').map((i) => i.materialCode)).toEqual(['XM-09'])
  })
  it('chuỗi trống → tất cả, giữ thứ tự BE', () => {
    expect(filterStock(STOCK, '  ')).toEqual(STOCK)
  })
  it('không khớp → rỗng', () => {
    expect(filterStock(STOCK, 'zzz')).toEqual([])
  })
})

describe('baseUnitSlugOf', () => {
  it('lấy từ baseUnit, dự phòng từ units, không có → rỗng', () => {
    expect(baseUnitSlugOf(item('A', 'a'))).toBe('u-kg')
    expect(baseUnitSlugOf(item('A', 'a', { baseUnit: null }))).toBe('u-kg')
    expect(baseUnitSlugOf(item('A', 'a', { baseUnit: null, units: [] }))).toBe('')
  })
})
