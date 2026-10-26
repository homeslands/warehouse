import { describe, expect, it } from 'vitest'
import type { ExportForm, ExportFormItem } from '@/entities/export-form'
import {
  EMPTY_EXPORT_ITEM,
  buildExportFormSchema,
  emptyExportFormValues,
  suggestExportCode,
  toExportFormInput,
  toExportFormUpdate,
  toExportFormValues,
  type ExportFormItemValues,
  type ExportFormValues,
} from './export-form-editor.schema'

const exportFormItemFixture = (over: Partial<ExportFormItem> = {}): ExportFormItem => ({
  slug: 'xit-1',
  createdAt: '',
  updatedAt: '',
  lineNo: 1,
  materialSlug: 'm-flour',
  materialCode: 'VT-01',
  materialName: 'Bột mì',
  unitSlug: 'u-kg',
  unitCode: 'KG',
  unitName: 'Kilogram',
  batchSlug: null,
  batchExpiryDate: null,
  quantity: 10,
  conversionRate: 1,
  baseQuantity: 10,
  unitPrice: 20_000,
  amount: 200_000,
  note: null,
  ...over,
})

const exportFormFixture = (over: Partial<ExportForm> = {}): ExportForm => ({
  slug: 'xf-1',
  createdAt: '',
  updatedAt: '',
  version: 3,
  code: 'PX-0001',
  type: 'SALE',
  status: 'DRAFT',
  purchaseOrder: 'PO-12',
  invoiceCode: 'HD-123',
  requesterSlug: 'u-req',
  requesterName: 'A',
  approverSlug: null,
  approverName: null,
  receiver: 'Cửa hàng B',
  totalAmount: 200_000,
  note: null,
  file: null,
  warehouseSlug: 'w-a',
  items: [exportFormItemFixture()],
  ...over,
})

const NOW = new Date(2026, 9, 26, 9, 5)

const item = (over: Partial<ExportFormItemValues> = {}): ExportFormItemValues => ({
  ...EMPTY_EXPORT_ITEM,
  materialSlug: 'm1',
  unitSlug: 'u1',
  quantity: 2,
  unitPrice: 1000,
  ...over,
})

const values = (over: Partial<ExportFormValues> = {}): ExportFormValues => ({
  ...emptyExportFormValues(NOW),
  type: 'SALE',
  receiver: 'Cửa hàng B',
  purchaseOrder: 'PO-1',
  items: [item()],
  ...over,
})

const issues = (v: unknown, sale = true) => {
  const r = buildExportFormSchema({ sale }).safeParse(v)
  return r.success ? [] : r.error.issues.map((i) => [i.path.join('.'), i.message])
}

describe('buildExportFormSchema', () => {
  it('hợp lệ', () => {
    expect(issues(values())).toEqual([])
  })

  it('type, receiver, purchaseOrder bắt buộc (trim)', () => {
    const out = issues(values({ type: undefined as never, receiver: '  ', purchaseOrder: ' ' }))
    expect(out).toEqual(
      expect.arrayContaining([
        ['type', 'exportForms:typeRequired'],
        ['receiver', 'exportForms:receiverRequired'],
        ['purchaseOrder', 'exportForms:purchaseOrderRequired'],
      ]),
    )
  })

  it('giới hạn độ dài receiver / PO / invoiceCode / file', () => {
    const out = issues(
      values({
        receiver: 'a'.repeat(256),
        purchaseOrder: 'a'.repeat(65),
        invoiceCode: 'a'.repeat(65),
        file: 'a'.repeat(1025),
      }),
    )
    expect(out).toEqual(
      expect.arrayContaining([
        ['receiver', 'exportForms:receiverTooLong'],
        ['purchaseOrder', 'exportForms:referenceTooLong'],
        ['invoiceCode', 'exportForms:referenceTooLong'],
        ['file', 'exportForms:fileTooLong'],
      ]),
    )
  })

  it('mã phiếu sai định dạng', () => {
    expect(issues(values({ code: 'x' }))).toContainEqual(['code', 'exportForms:codeInvalid'])
    expect(issues(values({ code: ' ' }))).toContainEqual(['code', 'exportForms:codeRequired'])
  })

  it('items 1–200', () => {
    expect(issues(values({ items: [] }))).toContainEqual(['items', 'exportForms:itemsRequired'])
    const many = Array.from({ length: 201 }, (_, i) => item({ materialSlug: `m${i}` }))
    expect(issues(values({ items: many }))).toContainEqual(['items', 'exportForms:itemsTooMany'])
  })

  it('số lượng: > 0, ≤ 6 số lẻ, < giới hạn', () => {
    expect(issues(values({ items: [item({ quantity: 0 })] }))).toContainEqual([
      'items.0.quantity',
      'exportForms:quantityInvalid',
    ])
    expect(issues(values({ items: [item({ quantity: 0.1234567 })] }))).toContainEqual([
      'items.0.quantity',
      'exportForms:quantityInvalid',
    ])
    expect(issues(values({ items: [item({ quantity: 1e12 })] }))).toContainEqual([
      'items.0.quantity',
      'exportForms:quantityTooLarge',
    ])
    expect(issues(values({ items: [item({ quantity: undefined as never })] }))).toContainEqual([
      'items.0.quantity',
      'exportForms:quantityInvalid',
    ])
  })

  it('trùng vật tư + đơn vị + lô báo ở batchSlug của dòng sau', () => {
    expect(issues(values({ items: [item(), item()] }))).toEqual([
      ['items.1.batchSlug', 'exportForms:itemDuplicated'],
    ])
  })

  it('cùng vật tư khác lô hợp lệ', () => {
    expect(
      issues(values({ items: [item({ batchSlug: 'b1' }), item({ batchSlug: 'b2' })] })),
    ).toEqual([])
    expect(issues(values({ items: [item({ batchSlug: 'b1' }), item()] }))).toEqual([])
  })

  it('Bán thì đơn giá trống / âm / quá 2 số lẻ là lỗi', () => {
    for (const unitPrice of [undefined, -1, 1.234]) {
      expect(
        issues(values({ items: [item({ unitPrice: unitPrice as never })] })).map((i) => i[0]),
      ).toContain('items.0.unitPrice')
    }
    expect(issues(values({ items: [item({ unitPrice: 0 })] }))).toEqual([])
  })

  it('không phải Bán thì bỏ qua đơn giá trống', () => {
    expect(
      issues(values({ type: 'OTHER', items: [item({ unitPrice: undefined })] }), false),
    ).toEqual([])
  })
})

describe('mapping', () => {
  it('suggestExportCode / emptyExportFormValues', () => {
    expect(suggestExportCode(NOW)).toBe('PX-20261026-0905')
    const empty = emptyExportFormValues(NOW)
    expect(empty.code).toBe('PX-20261026-0905')
    expect(empty.items).toEqual([EMPTY_EXPORT_ITEM])
  })

  it('toExportFormValues: phiếu Bán giữ giá, lô null → ""', () => {
    const v = toExportFormValues(exportFormFixture())
    expect(v).toMatchObject({
      code: 'PX-0001',
      type: 'SALE',
      receiver: 'Cửa hàng B',
      purchaseOrder: 'PO-12',
      invoiceCode: 'HD-123',
      file: '',
      note: '',
    })
    expect(v.items[0]).toMatchObject({ unitPrice: 20_000, batchSlug: '', note: '' })
  })

  it('toExportFormValues: phiếu không phải Bán để giá trống', () => {
    const v = toExportFormValues(
      exportFormFixture({
        type: 'OTHER',
        items: [exportFormItemFixture({ unitPrice: 0, batchSlug: 'b1' })],
      }),
    )
    expect(v.items[0].unitPrice).toBeUndefined()
    expect(v.items[0].batchSlug).toBe('b1')
  })

  it('toExportFormInput: OTHER có unitPrice 1000 → gửi 0; batchSlug "" bị bỏ; trường rỗng bị bỏ', () => {
    const input = toExportFormInput(
      values({
        type: 'OTHER',
        code: ' px-1 ',
        items: [
          item({ unitPrice: 1000 }),
          item({ materialSlug: 'm2', batchSlug: 'b1', note: ' hi ' }),
        ],
      }),
    )
    expect(input).toEqual({
      code: 'PX-1',
      type: 'OTHER',
      purchaseOrder: 'PO-1',
      receiver: 'Cửa hàng B',
      items: [
        { materialSlug: 'm1', unitSlug: 'u1', quantity: 2, unitPrice: 0 },
        {
          materialSlug: 'm2',
          unitSlug: 'u1',
          quantity: 2,
          unitPrice: 0,
          batchSlug: 'b1',
          note: 'hi',
        },
      ],
    })
  })

  it('toExportFormInput: SALE giữ giá và gửi các ô tuỳ chọn có giá trị', () => {
    const input = toExportFormInput(values({ invoiceCode: ' HD ', file: 'f', note: ' n ' }))
    expect(input).toMatchObject({ invoiceCode: 'HD', file: 'f', note: 'n' })
    expect(input.items[0].unitPrice).toBe(1000)
  })

  it('toExportFormUpdate: gửi version và "" để xoá ô tuỳ chọn', () => {
    const update = toExportFormUpdate(
      values({ invoiceCode: '', file: '', note: '' }),
      exportFormFixture(),
    )
    expect(update).toMatchObject({ version: 3, invoiceCode: '', file: '', note: '' })
    expect(update.items).toHaveLength(1)
  })
})
