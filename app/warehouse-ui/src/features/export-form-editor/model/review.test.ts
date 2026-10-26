import { describe, expect, it } from 'vitest'
import {
  EMPTY_EXPORT_ITEM,
  emptyExportFormValues,
  type ExportFormValues,
} from './export-form-editor.schema'
import { reviewExportForm } from './review'

const NOW = new Date(2026, 9, 26, 9, 5)
const stock = new Map([
  [
    'm1',
    {
      availableQuantity: 10,
      baseUnit: { slug: 'kg', code: 'KG', name: 'Kg' },
      units: [
        { unitSlug: 'kg', unitCode: 'KG', unitName: 'Kg', conversionRate: 1, isBaseUnit: true },
      ],
    },
  ],
])

const make = (
  type: ExportFormValues['type'],
  items: Partial<ExportFormValues['items'][number]>[],
) =>
  ({
    ...emptyExportFormValues(NOW),
    type,
    items: items.map((i) => ({
      ...EMPTY_EXPORT_ITEM,
      materialSlug: 'm1',
      unitSlug: 'kg',
      quantity: 1,
      unitPrice: 500,
      ...i,
    })),
  }) as ExportFormValues

describe('reviewExportForm', () => {
  it('không cảnh báo khi ổn', () => {
    expect(
      reviewExportForm(make('SALE', [{}]), { stock, batches: new Map(), now: NOW }).warnings,
    ).toEqual([])
  })

  it('shortage', () => {
    const { warnings } = reviewExportForm(make('OTHER', [{ quantity: 11 }]), {
      stock,
      batches: new Map(),
      now: NOW,
    })
    expect(warnings).toEqual([
      { kind: 'shortage', index: 0, available: 10, requested: 11, baseUnitCode: 'KG' },
    ])
  })

  it('zeroPrice chỉ khi Bán', () => {
    const ctx = { stock, batches: new Map(), now: NOW }
    expect(reviewExportForm(make('SALE', [{ unitPrice: 0 }]), ctx).warnings).toEqual([
      { kind: 'zeroPrice', index: 0 },
    ])
    expect(reviewExportForm(make('OTHER', [{ unitPrice: 0 }]), ctx).warnings).toEqual([])
  })

  it('expiredBatch khi lô chọn tay đã hết hạn (hôm nay chưa tính)', () => {
    const items = [{ batchSlug: 'b1' }, { batchSlug: 'b2', materialSlug: 'm1', unitSlug: 'kg' }]
    const batches = new Map([
      ['b1', { availableQuantity: 5, expiryDate: '2026-10-25' }],
      ['b2', { availableQuantity: 5, expiryDate: '2026-10-26' }],
    ])
    const { warnings } = reviewExportForm(make('OTHER', items), { stock, batches, now: NOW })
    expect(warnings).toEqual([{ kind: 'expiredBatch', index: 0, expiryDate: '2026-10-25' }])
  })

  it('lô không hạn không báo', () => {
    const batches = new Map([['b1', { availableQuantity: 5, expiryDate: null }]])
    expect(
      reviewExportForm(make('OTHER', [{ batchSlug: 'b1' }]), { stock, batches, now: NOW }).warnings,
    ).toEqual([])
  })
})
