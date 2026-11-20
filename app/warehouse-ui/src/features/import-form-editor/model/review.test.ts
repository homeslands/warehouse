import { describe, expect, it } from 'vitest'
import type { AvailableMaterial } from '@/entities/import-form'
import { EMPTY_ITEM, type ImportFormValues } from './import-form-editor.schema'
import { overMaxByLine, reviewImportForm } from './review'

const mat = (over: Partial<AvailableMaterial> & { slug: string }): AvailableMaterial => ({
  code: over.slug,
  name: over.slug,
  baseUnitSlug: 'u-kg',
  quantity: 0,
  suppliers: [],
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
    { unitSlug: 'u-bao', unitCode: 'BAO', unitName: 'Bao', conversionRate: 50, isBaseUnit: false },
  ],
  ...over,
})

const values = (
  items: Partial<ImportFormValues['items'][number]>[],
  header = '',
): ImportFormValues => ({
  supplierSlug: header,
  code: 'PN-1',
  invoiceCode: 'HD',
  purchaseOrder: '',
  date: '2026-10-13',
  file: '',
  note: '',
  items: items.map((i) => ({
    ...EMPTY_ITEM,
    materialSlug: 'm-a',
    unitSlug: 'u-kg',
    quantity: 1,
    unitPrice: 10,
    ...i,
  })),
})

const map = (...ms: AvailableMaterial[]) => new Map(ms.map((m) => [m.slug, m]))

describe('reviewImportForm', () => {
  it('giá 0 → zeroPrice', () => {
    const r = reviewImportForm(values([{ unitPrice: 0 }]), map(mat({ slug: 'm-a' })))
    expect(r.warnings).toEqual([{ kind: 'zeroPrice', index: 0 }])
  })

  it('đơn vị không phải gốc → nonBaseUnit', () => {
    const r = reviewImportForm(
      values([{ unitSlug: 'u-bao', quantity: 2 }]),
      map(mat({ slug: 'm-a' })),
    )
    expect(r.warnings).toEqual([
      {
        kind: 'nonBaseUnit',
        index: 0,
        quantity: 2,
        unitCode: 'BAO',
        baseQuantity: 100,
        baseUnitCode: 'KG',
      },
    ])
  })

  it('overMaxByLine: tồn + nhập vượt max → báo ở dòng cuối; không có max hoặc max = 0 thì không', () => {
    const items = [{ materialSlug: 'm-a', unitSlug: 'u-kg', quantity: 50 }]
    const over = overMaxByLine(
      items,
      map(mat({ slug: 'm-a', quantity: 60, effectiveMaximumInventory: 100 })),
    )
    expect(Object.fromEntries(over)).toEqual({
      0: { after: 110, max: 100, baseUnitCode: 'KG' },
    })
    expect(overMaxByLine(items, map(mat({ slug: 'm-a', quantity: 60 }))).size).toBe(0)
    expect(
      overMaxByLine(items, map(mat({ slug: 'm-a', quantity: 60, effectiveMaximumInventory: 0 })))
        .size,
    ).toBe(0)
    // Chưa nhập hoặc nhập 0 (chỉ còn tồn cũ vượt max) không coi là đang làm vượt thêm ở dòng trống.
    expect(
      overMaxByLine(
        [{ materialSlug: 'm-a', unitSlug: 'u-kg', quantity: undefined }],
        map(mat({ slug: 'm-a', quantity: 120, effectiveMaximumInventory: 100 })),
      ).size,
    ).toBe(0)
  })

  it('overMaxByLine: cộng dồn các dòng cùng vật tư trước khi so với max', () => {
    const r = overMaxByLine(
      [
        { materialSlug: 'm-a', unitSlug: 'u-kg', quantity: 30 },
        { materialSlug: 'm-a', unitSlug: 'u-bao', quantity: 30 },
      ],
      map(mat({ slug: 'm-a', quantity: 0, effectiveMaximumInventory: 100 })),
    )
    expect(Object.fromEntries(r)).toEqual({
      1: { after: 1530, max: 100, baseUnitCode: 'KG' },
    })
  })

  it('overMaxByLine: làm tròn 6 chữ số thập phân để không báo vượt sai do sai số float', () => {
    const materials = map(mat({ slug: 'm-a', quantity: 99.7, effectiveMaximumInventory: 100 }))
    // `99.7 + 0.1 + 0.1 + 0.1` trong IEEE-754 ra 100.00000000000001; làm tròn 6 số lẻ = 100 (không vượt).
    expect(
      overMaxByLine(
        [
          { materialSlug: 'm-a', unitSlug: 'u-kg', quantity: 0.1 },
          { materialSlug: 'm-a', unitSlug: 'u-kg', quantity: 0.1 },
          { materialSlug: 'm-a', unitSlug: 'u-kg', quantity: 0.1 },
        ],
        materials,
      ).size,
    ).toBe(0)

    const over = overMaxByLine(
      [
        { materialSlug: 'm-a', unitSlug: 'u-kg', quantity: 0.1 },
        { materialSlug: 'm-a', unitSlug: 'u-kg', quantity: 0.1 },
        { materialSlug: 'm-a', unitSlug: 'u-kg', quantity: 0.100001 },
      ],
      materials,
    )
    expect(Object.fromEntries(over)).toEqual({
      2: { after: 100.000001, max: 100, baseUnitCode: 'KG' },
    })
  })

  it('overMaxByLine: fallback theo baseUnitSlug khi vật tư cũ thiếu cờ isBaseUnit', () => {
    const legacy = mat({
      slug: 'm-legacy',
      quantity: 95,
      effectiveMaximumInventory: 100,
      units: [
        {
          unitSlug: 'u-kg',
          unitCode: 'KG',
          unitName: 'Kilogram',
          conversionRate: 1,
          isBaseUnit: false,
        },
      ],
    })
    const over = overMaxByLine(
      [{ materialSlug: 'm-legacy', unitSlug: 'u-kg', quantity: 10 }],
      map(legacy),
    )
    expect(Object.fromEntries(over)).toEqual({
      0: { after: 105, max: 100, baseUnitCode: 'KG' },
    })
  })

  it('bước Kiểm tra (reviewImportForm) không lặp lại cảnh báo vượt max', () => {
    const r = reviewImportForm(
      values([{ quantity: 50 }]),
      map(mat({ slug: 'm-a', quantity: 60, effectiveMaximumInventory: 100 })),
    )
    expect(r.warnings).toEqual([])
  })

  it('NCC hiệu lực khác nhau + liên kết mới gom theo NCC', () => {
    const r = reviewImportForm(
      values(
        [
          { materialSlug: 'm-a' },
          { materialSlug: 'm-b' },
          { materialSlug: 'm-c', supplierOverride: 's-2' },
        ],
        's-1',
      ),
      map(
        mat({ slug: 'm-a' }),
        mat({ slug: 'm-b', suppliers: [{ slug: 's-1', code: 'x', name: 'x' }] }),
        mat({ slug: 'm-c' }),
      ),
    )
    expect(r.supplierSlugs).toEqual(['s-1', 's-2'])
    expect(r.newLinks).toEqual([
      { supplierSlug: 's-1', materialSlugs: ['m-a'] },
      { supplierSlug: 's-2', materialSlugs: ['m-c'] },
    ])
  })

  it('vật tư không nằm trong map → vẫn tính bên bán hiệu lực và cảnh báo đơn giá 0', () => {
    const r = reviewImportForm(
      values(
        [
          { materialSlug: 'm-a' },
          { materialSlug: 'm-x', unitPrice: 0 },
          { materialSlug: 'm-y', supplierOverride: 's-2' },
        ],
        's-1',
      ),
      map(mat({ slug: 'm-a', suppliers: [{ slug: 's-1', code: 'x', name: 'x' }] })),
    )
    expect(r.supplierSlugs).toEqual(['s-1', 's-2'])
    expect(r.warnings).toEqual([{ kind: 'zeroPrice', index: 1 }])
    // Không biết NCC của vật tư lạ → không đoán liên kết mới.
    expect(r.newLinks).toEqual([])
  })
})
