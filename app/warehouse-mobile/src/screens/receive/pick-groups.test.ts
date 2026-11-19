import type { AvailableMaterial } from '@/entities/import-form'
import type { Material } from '@/entities/material'

import { catalogToAvailable, notInWarehouse, splitBySupplier } from './pick-groups'

const m = (slug: string, name: string, supplierSlugs: string[] = []) =>
  ({
    slug,
    code: slug.toUpperCase(),
    name,
    suppliers: supplierSlugs.map((s) => ({ slug: s, code: s, name: s })),
  }) as unknown as AvailableMaterial

const A = m('a', 'Sữa tươi', ['s1'])
const B = m('b', 'Bột mì', ['s2'])
const C = m('c', 'Đường', ['s1', 's2'])
const D = m('d', 'Muối')

describe('splitBySupplier', () => {
  it('chia theo bên bán của phiếu, giữ thứ tự đầu vào', () => {
    expect(splitBySupplier([A, B, C, D], 's1', '')).toEqual({ mine: [A, C], others: [B, D] })
  })
  it('lọc không dấu theo tên và theo mã', () => {
    expect(splitBySupplier([A, B, C, D], 's1', 'sua')).toEqual({ mine: [A], others: [] })
    expect(splitBySupplier([A, B, C, D], 's1', 'D')).toEqual({ mine: [C], others: [D] })
  })
  it('không có bên bán → mọi thứ vào others', () => {
    expect(splitBySupplier([A, B], null, '')).toEqual({ mine: [], others: [A, B] })
  })
})

describe('notInWarehouse', () => {
  const cat = (slug: string, wh: string[]) =>
    ({
      slug,
      code: slug.toUpperCase(),
      name: slug,
      baseUnit: { slug: 'kg', code: 'KG', name: 'kg' },
      suppliers: [{ slug: 's1', code: 'S1', name: 'NCC' }],
      warehouses: wh.map((w) => ({ slug: w, code: w, name: w, quantity: 0, availableQuantity: 0 })),
      units: [
        { unitSlug: 'kg', unitCode: 'KG', unitName: 'kg', conversionRate: 1, isBaseUnit: true },
      ],
    }) as unknown as Material

  it('loại vật tư đã ở kho (theo warehouses) và vật tư đã có trong danh sách khả dụng', () => {
    const items = [cat('a', ['w1']), cat('b', ['w2']), cat('c', []), cat('d', [])]
    const r = notInWarehouse(items, 'w1', new Set(['c']))
    expect(r.map((m) => m.slug)).toEqual(['b', 'd'])
  })
})

describe('catalogToAvailable', () => {
  it('giữ NCC thật, đơn vị gốc; thiếu đơn vị gốc → baseUnitSlug null', () => {
    const base = {
      slug: 'a',
      code: 'A',
      name: 'A',
      baseUnit: { slug: 'kg', code: 'KG', name: 'kg' },
      suppliers: [{ slug: 's1', code: 'S1', name: 'NCC' }],
      units: [],
    } as unknown as Material
    expect(catalogToAvailable(base)).toMatchObject({
      slug: 'a',
      baseUnitSlug: 'kg',
      quantity: 0,
      suppliers: [{ slug: 's1', code: 'S1', name: 'NCC' }],
    })
    expect(catalogToAvailable({ ...base, baseUnit: null }).baseUnitSlug).toBeNull()
  })
})
