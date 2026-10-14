import { describe, expect, it } from 'vitest'
import type { AvailableMaterial, ImportForm } from '@/entities/import-form'
import {
  EMPTY_ITEM,
  IMPORT_FORM_ITEMS_MAX,
  baseUnitOf,
  emptyFormValues,
  formTotal,
  importFormSchema,
  lineAmount,
  suggestCode,
  toCreateInput,
  toFormValues,
  toUpdateInput,
  type ImportFormValues,
} from './import-form-editor.schema'

// Dữ liệu giả — sao chép từ `@/entities/import-form/model/fixtures` (deep import bị `boundaries/entry-point` chặn).
const flour: AvailableMaterial = {
  slug: 'm-flour',
  code: 'VT-01',
  name: 'Bột mì',
  baseUnitSlug: 'u-kg',
  quantity: 120,
  supplierSlug: 's-1',
  supplierName: 'NCC Bột',
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
    {
      unitSlug: 'u-bag',
      unitCode: 'BAG',
      unitName: 'Bao 25kg',
      conversionRate: 25,
      isBaseUnit: false,
    },
  ],
}

const draftForm: ImportForm = {
  slug: 'if-1',
  createdAt: '2026-10-12T02:00:00.000Z',
  updatedAt: '2026-10-12T02:00:00.000Z',
  version: 3,
  code: 'PN-0001',
  purchaseOrder: 'PO-12',
  invoiceCode: 'HD-123',
  requesterSlug: 'u-sup',
  requesterName: 'Nguyễn Văn A',
  approverSlug: null,
  approverName: null,
  date: '2026-10-12',
  total: 3_750_000,
  file: 'hoa-don-1760000000000.pdf',
  note: 'Giao buổi sáng',
  status: 'DRAFT',
  warehouseSlug: 'w-a',
  items: [
    {
      slug: 'it-1',
      createdAt: '',
      updatedAt: '',
      lineNo: 1,
      materialSlug: 'm-flour',
      materialCode: 'VT-01',
      materialName: 'Bột mì',
      unitSlug: 'u-bag',
      unitCode: 'BAG',
      unitName: 'Bao 25kg',
      supplierSlug: 's-1',
      supplierCode: 'NCC-01',
      supplierName: 'NCC Bột',
      supplierTaxCode: '0101',
      supplierAddress: 'Hà Nội',
      quantity: 10,
      conversionRate: 25,
      baseQuantity: 250,
      unitPrice: 375_000,
      amount: 3_750_000,
      note: null,
    },
  ],
}

const NOW = new Date(2026, 9, 13, 8, 5) // 13/10/2026 08:05 giờ máy

const valid = (): ImportFormValues => ({
  code: 'pn-0002',
  invoiceCode: ' HD-1 ',
  purchaseOrder: '',
  date: '2026-10-13',
  file: '',
  note: '',
  items: [{ materialSlug: 'm-flour', unitSlug: 'u-bag', quantity: 2, unitPrice: 375000, note: '' }],
})

const issues = (values: ImportFormValues) => {
  const r = importFormSchema.safeParse(values)
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}:${i.message}`)
}

describe('importFormSchema', () => {
  it('hợp lệ', () => {
    expect(issues(valid())).toEqual([])
  })

  it('mã: bắt buộc, đúng BUSINESS_CODE_REGEX', () => {
    expect(issues({ ...valid(), code: '' })).toContain('code:importForms:codeRequired')
    expect(issues({ ...valid(), code: '-PN' })).toContain('code:importForms:codeInvalid')
    expect(issues({ ...valid(), code: 'P' })).toContain('code:importForms:codeInvalid')
  })

  it('số HĐ bắt buộc, PO / HĐ tối đa 64', () => {
    expect(issues({ ...valid(), invoiceCode: '  ' })).toContain(
      'invoiceCode:importForms:invoiceCodeRequired',
    )
    expect(issues({ ...valid(), purchaseOrder: 'x'.repeat(65) })).toContain(
      'purchaseOrder:importForms:referenceTooLong',
    )
  })

  it('ngày bắt buộc', () => {
    expect(issues({ ...valid(), date: undefined })).toContain('date:importForms:dateRequired')
  })

  it('số lượng > 0, ≤ 6 số lẻ, < 1e12; đơn giá ≥ 0, ≤ 2 số lẻ', () => {
    const item = (patch: Partial<ImportFormValues['items'][number]>) => ({
      ...valid(),
      items: [{ ...valid().items[0], ...patch }],
    })
    expect(issues(item({ quantity: 0 }))).toContain('items.0.quantity:importForms:quantityInvalid')
    expect(issues(item({ quantity: 0.1234567 }))).toContain(
      'items.0.quantity:importForms:quantityInvalid',
    )
    expect(issues(item({ quantity: undefined }))).toContain(
      'items.0.quantity:importForms:quantityInvalid',
    )
    expect(issues(item({ quantity: 1e12 }))).toContain(
      'items.0.quantity:importForms:quantityTooLarge',
    )
    expect(issues(item({ unitPrice: -1 }))).toContain(
      'items.0.unitPrice:importForms:unitPriceInvalid',
    )
    expect(issues(item({ unitPrice: 1.005 }))).toContain(
      'items.0.unitPrice:importForms:unitPriceInvalid',
    )
    expect(issues(item({ unitPrice: 0 }))).toEqual([])
  })

  it('ít nhất 1 dòng, tối đa 200', () => {
    expect(issues({ ...valid(), items: [] })).toContain('items:importForms:itemsRequired')
    const many = Array.from({ length: IMPORT_FORM_ITEMS_MAX + 1 }, (_, i) => ({
      ...valid().items[0],
      materialSlug: `m-${i}`,
    }))
    expect(issues({ ...valid(), items: many })).toContain('items:importForms:itemsTooMany')
  })

  it('trùng cặp (vật tư, đơn vị) → lỗi ở dòng sau; khác đơn vị thì được', () => {
    const a = valid().items[0]
    expect(issues({ ...valid(), items: [a, { ...a }] })).toEqual([
      'items.1.unitSlug:importForms:itemDuplicated',
    ])
    expect(issues({ ...valid(), items: [a, { ...a, unitSlug: 'u-kg' }] })).toEqual([])
  })
})

describe('chuyển đổi', () => {
  it('suggestCode / emptyFormValues theo giờ máy', () => {
    expect(suggestCode(NOW)).toBe('PN-20261013-0805')
    expect(emptyFormValues(NOW)).toMatchObject({
      code: 'PN-20261013-0805',
      date: '2026-10-13',
      items: [EMPTY_ITEM],
    })
  })

  it('toCreateInput: trim, viết hoa mã, bỏ trường tuỳ chọn rỗng', () => {
    expect(toCreateInput(valid())).toEqual({
      code: 'PN-0002',
      invoiceCode: 'HD-1',
      date: '2026-10-13',
      items: [{ materialSlug: 'm-flour', unitSlug: 'u-bag', quantity: 2, unitPrice: 375000 }],
    })
    expect(
      toCreateInput({ ...valid(), note: ' x ', file: 'k.pdf', purchaseOrder: 'PO' }),
    ).toMatchObject({
      note: 'x',
      file: 'k.pdf',
      purchaseOrder: 'PO',
    })
  })

  it('toUpdateInput: gửi đủ đầu phiếu (rỗng = "" để xoá), toàn bộ items, version', () => {
    expect(toUpdateInput(valid(), 3)).toEqual({
      version: 3,
      code: 'PN-0002',
      invoiceCode: 'HD-1',
      date: '2026-10-13',
      purchaseOrder: '',
      file: '',
      note: '',
      items: [{ materialSlug: 'm-flour', unitSlug: 'u-bag', quantity: 2, unitPrice: 375000 }],
    })
  })

  it('toFormValues: null → "", ghi chú dòng null → ""', () => {
    expect(
      toFormValues({ ...draftForm, purchaseOrder: null, note: null, file: null }),
    ).toMatchObject({
      code: 'PN-0001',
      purchaseOrder: '',
      note: '',
      file: '',
      items: [
        { materialSlug: 'm-flour', unitSlug: 'u-bag', quantity: 10, unitPrice: 375000, note: '' },
      ],
    })
  })

  it('lineAmount / formTotal làm tròn tiền', () => {
    expect(lineAmount(3, 0.1)).toBe(0.3)
    expect(lineAmount(undefined, 5)).toBeUndefined()
    expect(
      formTotal([
        { ...EMPTY_ITEM, quantity: 3, unitPrice: 0.1 },
        { ...EMPTY_ITEM, quantity: 2, unitPrice: 0.2 },
        { ...EMPTY_ITEM, quantity: undefined, unitPrice: 9 },
      ]),
    ).toBe(0.7)
  })

  it('baseUnitOf', () => {
    expect(baseUnitOf(flour)?.unitSlug).toBe('u-kg')
  })
})
