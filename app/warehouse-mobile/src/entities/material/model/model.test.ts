import type { CurrentUser } from '@/entities/session'
import type { Paginated } from '@/shared/api/types'
import { materialAbilities } from './abilities'
import { isBaseUnitLocked } from './base-unit-lock'
import { flattenMaterialPages } from './flatten'
import type { Material } from './types'

const mat = (slug: string, over: Partial<Material> = {}): Material => ({
  slug,
  code: slug,
  name: slug,
  minimumInventory: 0,
  maximumInventory: 0,
  type: { slug: 't', code: 'T', name: 'T' },
  baseUnit: { slug: 'kg', code: 'KG', name: 'Kg' },
  hasSupplier: false,
  suppliers: [],
  warehouses: [],
  units: [{ unitSlug: 'kg', unitCode: 'KG', unitName: 'Kg', conversionRate: 1, isBaseUnit: true }],
  createdAt: '',
  updatedAt: '',
  ...over,
})
const page = (items: Material[]): Paginated<Material> => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 30,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
})
const user = (scope: string[], roleName = 'STAFF') =>
  ({ userName: 'u', roleName, scope }) as CurrentUser

describe('flattenMaterialPages', () => {
  it('khử trùng theo slug', () => {
    const out = flattenMaterialPages([page([mat('a'), mat('b')]), page([mat('a'), mat('c')])])
    expect(out.map((m) => m.slug)).toEqual(['a', 'b', 'c'])
  })
})

describe('isBaseUnitLocked', () => {
  const wh = (quantity: number) => ({
    slug: 'w',
    code: 'W',
    name: 'W',
    quantity,
    availableQuantity: 0,
  })
  it('kho 0 + 1 unit → mở', () =>
    expect(isBaseUnitLocked(mat('a', { warehouses: [wh(0)] }))).toBe(false))
  it('kho có tồn → khoá', () =>
    expect(isBaseUnitLocked(mat('a', { warehouses: [wh(5)] }))).toBe(true))
  it('chưa có đơn vị gốc (baseUnit null) + có tồn → mở', () =>
    expect(isBaseUnitLocked(mat('a', { baseUnit: null, warehouses: [wh(5)] }))).toBe(false))
  it('2 unit → khoá', () => {
    const u = { unitSlug: 'x', unitCode: 'X', unitName: 'X', conversionRate: 2, isBaseUnit: false }
    expect(isBaseUnitLocked(mat('a', { units: [...mat('a').units, u] }))).toBe(true)
  })
})

describe('materialAbilities', () => {
  it('thiếu UNIT_READ → không tạo được', () => {
    expect(materialAbilities(user(['MATERIAL_CREATE'])).create).toBe(false)
  })
  it('manageConversions cần MATERIAL_UPDATE + UNIT_UPDATE + UNIT_READ', () => {
    expect(
      materialAbilities(user(['MATERIAL_UPDATE', 'UNIT_UPDATE', 'UNIT_READ'])).manageConversions,
    ).toBe(true)
    expect(materialAbilities(user(['MATERIAL_UPDATE', 'UNIT_READ'])).manageConversions).toBe(false)
  })
  it('SUPER_ADMIN có tất cả', () => {
    expect(materialAbilities(user([], 'SUPER_ADMIN'))).toEqual({
      read: true,
      create: true,
      update: true,
      delete: true,
      manageConversions: true,
    })
  })
})
