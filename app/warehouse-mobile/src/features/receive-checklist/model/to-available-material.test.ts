import type { InventoryItem } from '@/entities/inventory'

import { toAvailableMaterial } from './to-available-material'

const KG = {
  unitSlug: 'kg',
  unitCode: 'KG',
  unitName: 'Kilogam',
  conversionRate: 1,
  isBaseUnit: true,
}
const BAO = {
  unitSlug: 'bao',
  unitCode: 'BAO',
  unitName: 'Bao',
  conversionRate: 50,
  isBaseUnit: false,
}
const item = {
  materialSlug: 'm-new',
  materialCode: 'SP01',
  materialName: 'Gạo',
  quantity: 7,
  baseUnit: { slug: 'kg', code: 'KG', name: 'Kilogam' },
  units: [BAO, KG],
} as unknown as InventoryItem

describe('toAvailableMaterial', () => {
  it('map slug / code / name / đơn vị gốc, tồn 0, units nguyên', () => {
    expect(toAvailableMaterial(item)).toEqual({
      slug: 'm-new',
      code: 'SP01',
      name: 'Gạo',
      baseUnitSlug: 'kg',
      quantity: 0,
      suppliers: [],
      units: [BAO, KG],
    })
  })
  it('có bên bán của phiếu → suppliers có nó', () => {
    const s = { slug: 's1', code: 'N1', name: 'Hoà Phát' }
    expect(toAvailableMaterial(item, s).suppliers).toEqual([s])
  })
  it('chưa có đơn vị gốc → baseUnitSlug null', () => {
    expect(
      toAvailableMaterial({ ...item, baseUnit: null } as InventoryItem).baseUnitSlug,
    ).toBeNull()
  })
})
