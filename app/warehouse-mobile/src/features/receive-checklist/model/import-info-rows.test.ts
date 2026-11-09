import i18n, { changeLanguage, initI18n } from '@/shared/i18n'

import { importInfoRows } from './import-info-rows'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const t = i18n.t.bind(i18n)
const full = {
  invoiceCode: 'HD-1',
  date: '2026-11-04',
  code: 'PN-1',
  purchaseOrder: 'PO-1',
  note: 'ghi chú',
}

describe('importInfoRows', () => {
  it('đủ trường → 6 dòng tách riêng, đúng nhãn / định dạng', () => {
    const rows = importInfoRows(full, { supplierName: 'Cty A', t })
    expect(rows.map((r) => r.key)).toEqual([
      'supplier',
      'invoiceCode',
      'date',
      'code',
      'purchaseOrder',
      'note',
    ])
    expect(rows.map((r) => r.label)).toEqual([
      'Bên bán',
      'Số HĐ',
      'Ngày nhập',
      'Mã phiếu',
      'Số PO',
      'Ghi chú',
    ])
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.date!.value).toBe('04/11/2026')
    expect(rows.map((r) => r.format)).toEqual([
      undefined,
      'code',
      'numeric',
      'code',
      'code',
      undefined,
    ])
    expect(by.note!.lines).toBe(1)
  })

  it('noteLines được truyền vào dòng ghi chú', () => {
    const rows = importInfoRows(full, { supplierName: null, t, noteLines: 3 })
    expect(rows.find((r) => r.key === 'note')!.lines).toBe(3)
  })

  it('thiếu bên bán / PO / ghi chú → bỏ dòng', () => {
    const rows = importInfoRows(
      { ...full, purchaseOrder: null, note: null },
      { supplierName: null, t },
    )
    expect(rows.map((r) => r.key)).toEqual(['invoiceCode', 'date', 'code'])
  })
})
