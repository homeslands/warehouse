import { newDraft } from '@/features/receive-checklist'
import { makeLine } from '@/features/receive-checklist/model/fixtures'
import i18n, { changeLanguage, initI18n } from '@/shared/i18n'

import { importMissing, importMissingLabel } from './import-missing'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const t = i18n.t.bind(i18n)
const opts = { supplierRequired: false, isNew: true }
const draft = (
  lines = [makeLine(1)],
  header: Partial<ReturnType<typeof newDraft>['header']> = {},
) => {
  const d = newDraft({
    code: 'PN-1',
    invoiceCode: 'HD-1',
    date: '2026-11-04',
    purchaseOrder: null,
    note: null,
    supplierSlug: null,
    ...header,
  })
  return { ...d, lines }
}

describe('importMissing', () => {
  it('price empty is not missing', () => {
    expect(importMissing(draft([makeLine(1, { unitPrice: 0 })]), opts, t)).toEqual([])
  })

  it('zero quantity line is missing quantity', () => {
    expect(importMissing(draft([makeLine(1), makeLine(2, { quantity: 0 })]), opts, t)).toEqual([
      {
        id: 'line:m-2|u-2:quantity',
        group: 'quantity',
        target: { kind: 'line', key: 'm-2|u-2', field: 'quantity' },
      },
    ])
  })

  it('expiry before date is missing expiry', () => {
    const d = draft([makeLine(1, { expiryDate: '2026-11-03' })])
    expect(importMissing(d, opts, t)).toEqual([
      {
        id: 'line:m-1|u-1:expiry',
        group: 'expiry',
        target: { kind: 'line', key: 'm-1|u-1', field: 'expiry' },
      },
    ])
  })

  it('supplier only required for new forms with supplier list', () => {
    const d = draft()
    expect(
      importMissing(d, { supplierRequired: true, isNew: true }, t).map((i) => i.group),
    ).toEqual(['supplier'])
    expect(importMissing(d, { supplierRequired: true, isNew: false }, t)).toEqual([])
    expect(importMissing(d, { supplierRequired: false, isNew: true }, t)).toEqual([])
  })

  it('header order: Bên bán, Số HĐ, Ngày, Mã, PO, Ghi chú, then lines', () => {
    const d = draft([], { invoiceCode: '', code: '' })
    expect(
      importMissing(d, { supplierRequired: true, isNew: true }, t).map((i) => i.group),
    ).toEqual(['supplier', 'invoiceCode', 'code', 'lines'])
  })

  it('too many lines', () => {
    const many = Array.from({ length: 201 }, (_, i) => makeLine(i + 1))
    expect(importMissing(draft(many), opts, t).map((i) => i.group)).toEqual(['tooMany'])
  })
})

describe('importMissingLabel', () => {
  it('reads like the mockup', () => {
    const label = importMissingLabel(t)
    expect(label('supplier', 1)).toBe('Bên bán')
    expect(label('expiry', 2)).toBe('2 hạn dùng')
    expect(label('quantity', 1)).toBe('1 số lượng')
  })
})
