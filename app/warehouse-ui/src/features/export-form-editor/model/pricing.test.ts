import { describe, expect, it } from 'vitest'
import {
  buildExportFormSchema,
  emptyExportFormValues,
  EMPTY_EXPORT_ITEM,
} from './export-form-editor.schema'
import { clearPrices, pricedLinesCount } from './pricing'

describe('pricing', () => {
  it('pricedLinesCount đếm dòng có đơn giá là số > 0', () => {
    expect(
      pricedLinesCount([
        { unitPrice: 1000 },
        { unitPrice: 0 },
        { unitPrice: undefined },
        { unitPrice: 5 },
      ]),
    ).toBe(2)
  })

  it('clearPrices đặt unitPrice undefined, giữ ô khác', () => {
    const out = clearPrices([{ unitPrice: 1000, quantity: 2 }])
    expect(out).toEqual([{ unitPrice: undefined, quantity: 2 }])
  })

  it('xoá giá rồi kiểm tra schema Bán → lỗi unitPrice (không hồi sinh giá)', () => {
    const base = emptyExportFormValues(new Date(2026, 9, 26, 9, 5))
    const items = clearPrices([
      { ...EMPTY_EXPORT_ITEM, materialSlug: 'm', unitSlug: 'u', quantity: 1, unitPrice: 1000 },
    ])
    const result = buildExportFormSchema({ sale: true }).safeParse({
      ...base,
      type: 'SALE',
      receiver: 'A',
      purchaseOrder: 'PO',
      items,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('items.0.unitPrice')
  })
})
