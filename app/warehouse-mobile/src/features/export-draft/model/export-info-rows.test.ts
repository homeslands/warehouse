import i18n, { changeLanguage, initI18n } from '@/shared/i18n'

import { exportInfoRows } from './export-info-rows'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const t = i18n.t.bind(i18n)
const full = {
  type: 'PRODUCTION' as const,
  code: 'PX-1',
  purchaseOrder: 'PO-1',
  receiver: 'Bếp A',
  invoiceCode: 'HD-1' as string | null,
  note: 'ghi chú' as string | null,
}

describe('exportInfoRows', () => {
  it('đủ trường → 6 dòng, đúng nhãn / định dạng', () => {
    const rows = exportInfoRows(full, { t })
    expect(rows.map((r) => r.key)).toEqual([
      'type',
      'code',
      'purchaseOrder',
      'receiver',
      'invoiceCode',
      'note',
    ])
    expect(rows.map((r) => r.label)).toEqual([
      'Loại',
      'Mã phiếu',
      'Số PO',
      'Người nhận',
      'Số HĐ',
      'Ghi chú',
    ])
    expect(rows[0]!.value).toBe('Sản xuất')
    expect(rows.filter((r) => r.format === 'code').map((r) => r.key)).toEqual([
      'code',
      'purchaseOrder',
      'invoiceCode',
    ])
    expect(rows.find((r) => r.key === 'note')!.lines).toBe(1)
    expect(exportInfoRows(full, { t, noteLines: 2 }).at(-1)!.lines).toBe(2)
  })

  it('thiếu HĐ / ghi chú → bỏ dòng', () => {
    const rows = exportInfoRows({ ...full, invoiceCode: null, note: null }, { t })
    expect(rows.map((r) => r.key)).toEqual(['type', 'code', 'purchaseOrder', 'receiver'])
  })
})
