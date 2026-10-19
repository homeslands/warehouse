import { describe, expect, it } from 'vitest'
import type { AvailableMaterial } from '@/entities/import-form'
import { EMPTY_ITEM, type ImportFormValues } from './import-form-editor.schema'
import { reviewImportForm } from './review'

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

  it('tồn + nhập vượt max → overMax; không có max thì không', () => {
    const items = [{ quantity: 50 }]
    const over = reviewImportForm(
      values(items),
      map(mat({ slug: 'm-a', quantity: 60, effectiveMaximumInventory: 100 })),
    )
    expect(over.warnings).toEqual([
      { kind: 'overMax', index: 0, after: 110, max: 100, baseUnitCode: 'KG' },
    ])
    const none = reviewImportForm(values(items), map(mat({ slug: 'm-a', quantity: 60 })))
    expect(none.warnings).toEqual([])
  })

  it('cộng dồn các dòng cùng vật tư trước khi so với max', () => {
    const r = reviewImportForm(
      values([{ quantity: 30 }, { quantity: 30, unitSlug: 'u-bao' }]),
      map(mat({ slug: 'm-a', quantity: 0, effectiveMaximumInventory: 100 })),
    )
    expect(r.warnings.filter((w) => w.kind === 'overMax')).toHaveLength(1)
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
