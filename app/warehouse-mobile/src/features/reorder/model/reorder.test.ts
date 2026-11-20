import type { AvailableMaterial, AvailableSupplier } from '@/entities/import-form'
import type { InventoryItem } from '@/entities/inventory'
import { item } from '@/entities/inventory/model/fixtures'

import {
  buildReorderGroups,
  MARK_TTL_DAYS,
  reorderGroupKey,
  reorderLevel,
  suggestedBaseQty,
  YELLOW_FACTOR,
  type ReorderGroup,
  type ReorderLocal,
} from './reorder'

const supplier = (slug: string, name: string): AvailableSupplier => ({
  slug,
  code: slug.toUpperCase(),
  name,
})

const material = (slug: string, suppliers: AvailableSupplier[]): AvailableMaterial => ({
  slug,
  code: slug.toUpperCase(),
  name: slug,
  baseUnitSlug: 'u-bag',
  quantity: 0,
  suppliers,
  units: [],
})

/** Vật tư đỏ (tồn 4 < min 10, max 30 → gợi ý 26). */
const red = (slug: string, over: Partial<InventoryItem> = {}) =>
  item({
    slug: `inv-${slug}`,
    materialSlug: slug,
    materialCode: slug.toUpperCase(),
    materialName: slug,
    quantity: 4,
    effectiveMinimumInventory: 10,
    effectiveMaximumInventory: 30,
    ...over,
  })

/** Vật tư vàng (tồn 11, min 10). */
const yellow = (slug: string, over: Partial<InventoryItem> = {}) =>
  red(slug, { quantity: 11, ...over })

const build = (
  items: InventoryItem[],
  materials: AvailableMaterial[] | null,
  local: Record<string, ReorderLocal> = {},
  includeYellow = true,
) => buildReorderGroups({ items, materials, local, includeYellow })

/** Rút gọn để so: khoá nhóm + mã vật tư theo thứ tự. */
const shape = (groups: ReorderGroup[]) =>
  groups.map((g) => [reorderGroupKey(g), g.rows.map((r) => r.item.materialCode)])

const ABC = supplier('abc', 'Công ty Sữa ABC')
const XYZ = supplier('xyz', 'Đại lý XYZ')
const BINH = supplier('binh', 'Bình Minh')

describe('hằng số', () => {
  it('vàng = min × 1,2; dấu sống 7 ngày', () => {
    expect(YELLOW_FACTOR).toBe(1.2)
    expect(MARK_TTL_DAYS).toBe(7)
  })
})

describe('reorderLevel', () => {
  it('đỏ khi tồn < min', () =>
    expect(reorderLevel(item({ quantity: 4, effectiveMinimumInventory: 10 }))).toBe('red'))
  it('vàng khi tồn = min', () =>
    expect(reorderLevel(item({ quantity: 10, effectiveMinimumInventory: 10 }))).toBe('yellow'))
  it('vàng tới min*1.2', () =>
    expect(reorderLevel(item({ quantity: 12, effectiveMinimumInventory: 10 }))).toBe('yellow'))
  it('null trên min*1.2', () =>
    expect(reorderLevel(item({ quantity: 12.01, effectiveMinimumInventory: 10 }))).toBeNull())
  it('hết hàng luôn đỏ, kể cả min = 0 (khớp "Thiếu" = hết + dưới min của tab Tồn kho)', () =>
    expect(reorderLevel(item({ quantity: 0, effectiveMinimumInventory: 0 }))).toBe('red'))
  it('hết hàng + min âm / tồn âm vẫn đỏ', () => {
    expect(reorderLevel(item({ quantity: 0, effectiveMinimumInventory: -5 }))).toBe('red')
    expect(reorderLevel(item({ quantity: -2, effectiveMinimumInventory: 0 }))).toBe('red')
  })
  it('null khi min <= 0 mà còn hàng', () => {
    expect(reorderLevel(item({ quantity: 5, effectiveMinimumInventory: 0 }))).toBeNull()
    expect(reorderLevel(item({ quantity: 5, effectiveMinimumInventory: -5 }))).toBeNull()
  })
  it('hết hàng, max <= 0 → đỏ nhưng không có số gợi ý', () => {
    const it = item({ quantity: 0, effectiveMinimumInventory: 0, effectiveMaximumInventory: 0 })
    expect(reorderLevel(it)).toBe('red')
    expect(suggestedBaseQty(it)).toBeNull()
  })
  it('đỏ khi hết hàng và có min', () =>
    expect(reorderLevel(item({ quantity: 0, effectiveMinimumInventory: 10 }))).toBe('red'))
  it('biên vàng không bị rác dấu phẩy động (3 × 1,2 = 3,5999…)', () =>
    expect(reorderLevel(item({ quantity: 3.6, effectiveMinimumInventory: 3 }))).toBe('yellow'))
})

describe('suggestedBaseQty', () => {
  it('max − tồn, làm tròn lên', () =>
    expect(suggestedBaseQty(item({ quantity: 4.5, effectiveMaximumInventory: 30 }))).toBe(26))
  it('null khi max <= 0', () =>
    expect(suggestedBaseQty(item({ quantity: 4, effectiveMaximumInventory: 0 }))).toBeNull())
  it('null khi tồn >= max', () =>
    expect(suggestedBaseQty(item({ quantity: 30, effectiveMaximumInventory: 30 }))).toBeNull())
  it('null khi tồn > max', () =>
    expect(suggestedBaseQty(item({ quantity: 31, effectiveMaximumInventory: 30 }))).toBeNull())
  it('số nguyên không bị nâng thêm 1 do dấu phẩy động (1,1 − 0,1)', () =>
    expect(suggestedBaseQty(item({ quantity: 0.1, effectiveMaximumInventory: 1.1 }))).toBe(1))
  it('phần lẻ nhỏ vẫn làm tròn lên', () =>
    expect(suggestedBaseQty(item({ quantity: 0.3, effectiveMaximumInventory: 0.5 }))).toBe(1))
})

describe('buildReorderGroups — gom nhóm', () => {
  it('1 bên bán → nhóm bên bán đó', () => {
    const groups = build([red('a')], [material('a', [ABC])])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ kind: 'supplier', supplier: ABC })
    expect(groups[0].rows[0].suppliers).toEqual([ABC])
  })

  it('nhiều bên bán chưa chọn → choose', () => {
    expect(shape(build([red('a')], [material('a', [ABC, XYZ])]))).toEqual([['choose', ['A']]])
  })

  it('nhiều bên bán, đã chọn (còn trong danh sách) → nhóm đã chọn', () => {
    const groups = build([red('a')], [material('a', [ABC, XYZ])], { a: { supplierSlug: 'xyz' } })
    expect(shape(groups)).toEqual([['supplier-xyz', ['A']]])
    expect(groups[0]).toMatchObject({ kind: 'supplier', supplier: XYZ })
  })

  it('đã chọn nhưng bên bán bị gỡ khỏi vật tư → choose', () => {
    const groups = build([red('a')], [material('a', [ABC, XYZ])], { a: { supplierSlug: 'gone' } })
    expect(shape(groups)).toEqual([['choose', ['A']]])
  })

  it('1 bên bán mà đã chọn bên khác (bị gỡ) → vẫn nhóm bên bán duy nhất', () => {
    const groups = build([red('a')], [material('a', [ABC])], { a: { supplierSlug: 'gone' } })
    expect(shape(groups)).toEqual([['supplier-abc', ['A']]])
  })

  it('không bên bán → none', () => {
    expect(shape(build([red('a')], [material('a', [])]))).toEqual([['none', ['A']]])
  })

  it('vật tư có tồn nhưng không có trong materials → none, suppliers rỗng', () => {
    const groups = build([red('a')], [material('other', [ABC])])
    expect(shape(groups)).toEqual([['none', ['A']]])
    expect(groups[0].rows[0].suppliers).toEqual([])
  })

  it('materials null → đúng 1 nhóm all, suppliers rỗng', () => {
    const groups = build([red('a'), yellow('b')], null, { a: { supplierSlug: 'abc' } })
    expect(shape(groups)).toEqual([['all', ['A', 'B']]])
    expect(groups[0].rows.every((r) => r.suppliers.length === 0)).toBe(true)
  })

  it('materials null mà không vật tư nào cần đặt → không nhóm nào', () => {
    expect(build([item({ quantity: 50 })], null)).toEqual([])
  })

  it('thứ tự nhóm: choose, bên bán theo tên (vi), none', () => {
    const groups = build(
      [red('a'), red('b'), red('c'), red('d'), red('e')],
      [
        material('a', []),
        material('b', [XYZ]),
        material('c', [ABC, XYZ]),
        material('d', [BINH]),
        material('e', [ABC]),
      ],
    )
    // "Bình Minh" < "Công ty Sữa ABC" < "Đại lý XYZ" theo tiếng Việt (Đ sau D, sau C).
    expect(shape(groups)).toEqual([
      ['choose', ['C']],
      ['supplier-binh', ['D']],
      ['supplier-abc', ['E']],
      ['supplier-xyz', ['B']],
      ['none', ['A']],
    ])
  })

  it('cùng bên bán gom chung một nhóm', () => {
    const groups = build([red('a'), red('b')], [material('a', [ABC]), material('b', [ABC, XYZ])], {
      b: { supplierSlug: 'abc' },
    })
    expect(shape(groups)).toEqual([['supplier-abc', ['A', 'B']]])
  })

  it('trong nhóm: đỏ trước vàng, rồi theo mã', () => {
    const groups = build([yellow('a'), red('d'), yellow('b'), red('c')], [])
    expect(shape(groups)).toEqual([['none', ['C', 'D', 'A', 'B']]])
    expect(groups[0].rows.map((r) => r.level)).toEqual(['red', 'red', 'yellow', 'yellow'])
  })

  it('includeYellow=false → bỏ dòng vàng; nhóm rỗng không xuất hiện', () => {
    const groups = build(
      [red('a'), yellow('b')],
      [material('a', [ABC]), material('b', [XYZ])],
      {},
      false,
    )
    expect(shape(groups)).toEqual([['supplier-abc', ['A']]])
  })

  it('vật tư không cần đặt (trên min × 1,2 hoặc min 0) không vào nhóm', () => {
    const groups = build(
      [
        red('a'),
        red('b', { quantity: 50 }),
        red('c', { quantity: 5, effectiveMinimumInventory: 0 }),
      ],
      [],
    )
    expect(shape(groups)).toEqual([['none', ['A']]])
  })
})

describe('buildReorderGroups — số và dấu', () => {
  const only = (it: InventoryItem, local: Record<string, ReorderLocal> = {}) =>
    build([it], null, local)[0].rows[0]

  it('không có local → gợi ý theo đơn vị gốc', () => {
    const row = only(red('a'))
    expect(row.level).toBe('red')
    expect(row.suggestedBase).toBe(26)
    expect(row.qty).toEqual({ value: 26, unitSlug: 'u-bag' })
    expect(row.orderedAt).toBeNull()
  })

  const BOX = {
    unitSlug: 'u-box',
    unitCode: 'BOX',
    unitName: 'hộp',
    conversionRate: 10,
    isBaseUnit: false,
  }

  it('local.qty thắng gợi ý', () => {
    const row = only(red('a', { units: [BOX] }), { a: { qty: { value: 3, unitSlug: 'u-box' } } })
    expect(row.qty).toEqual({ value: 3, unitSlug: 'u-box' })
    expect(row.suggestedBase).toBe(26)
  })

  it('đơn vị đã lưu bị gỡ khỏi vật tư → bỏ số đã sửa, về gợi ý theo đơn vị gốc', () => {
    const row = only(red('a', { units: [] }), { a: { qty: { value: 3, unitSlug: 'u-box' } } })
    expect(row.qty).toEqual({ value: 26, unitSlug: 'u-bag' })
  })

  it('đơn vị đã lưu = đơn vị gốc dù units không liệt kê → giữ số đã sửa', () => {
    const row = only(red('a', { units: [] }), { a: { qty: { value: 3, unitSlug: 'u-bag' } } })
    expect(row.qty).toEqual({ value: 3, unitSlug: 'u-bag' })
  })

  it('đơn vị bị gỡ và không có gợi ý → qty null', () => {
    const row = only(red('a', { effectiveMaximumInventory: 0 }), {
      a: { qty: { value: 3, unitSlug: 'u-box' } },
    })
    expect(row.qty).toBeNull()
  })

  it('local.qty thắng cả khi không có gợi ý', () => {
    const row = only(red('a', { effectiveMaximumInventory: 0 }), {
      a: { qty: { value: 5, unitSlug: 'u-bag' } },
    })
    expect(row.suggestedBase).toBeNull()
    expect(row.qty).toEqual({ value: 5, unitSlug: 'u-bag' })
  })

  it('baseUnit null → qty null (dù có gợi ý)', () => {
    const row = only(red('a', { baseUnit: null }))
    expect(row.suggestedBase).toBe(26)
    expect(row.qty).toBeNull()
  })

  it('gợi ý null (max 0) → qty null', () => {
    const row = only(red('a', { effectiveMaximumInventory: 0 }))
    expect(row.suggestedBase).toBeNull()
    expect(row.qty).toBeNull()
  })

  it('orderedAt lấy từ local', () => {
    const row = only(red('a'), { a: { orderedAt: '2026-11-18' } })
    expect(row.orderedAt).toBe('2026-11-18')
  })

  it('local của vật tư khác không ảnh hưởng', () => {
    const row = only(red('a'), { b: { orderedAt: '2026-11-18', qty: { value: 1, unitSlug: 'x' } } })
    expect(row.orderedAt).toBeNull()
    expect(row.qty).toEqual({ value: 26, unitSlug: 'u-bag' })
  })
})

describe('reorderGroupKey', () => {
  it('choose | none | all | supplier-<slug>', () => {
    expect(reorderGroupKey({ kind: 'choose', rows: [] })).toBe('choose')
    expect(reorderGroupKey({ kind: 'none', rows: [] })).toBe('none')
    expect(reorderGroupKey({ kind: 'all', rows: [] })).toBe('all')
    expect(reorderGroupKey({ kind: 'supplier', supplier: ABC, rows: [] })).toBe('supplier-abc')
  })
})
