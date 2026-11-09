import type { TFunction } from 'i18next'

import type { ImportForm } from '@/entities/import-form'
import { formatFullDate } from '@/shared/lib/format'
import type { ReviewInfoRowData } from '@/shared/ui/compose'

export type ImportInfoInput = Pick<
  ImportForm,
  'invoiceCode' | 'date' | 'code' | 'purchaseOrder' | 'note'
>

const F = 'importForms:compose.fields'

/**
 * Các dòng nhóm "Thông tin" của phiếu nhập — dùng chung bước 3 của form và màn xem: Bên bán (khi biết
 * tên), Số HĐ, Ngày nhập, Mã phiếu, rồi Số PO / Ghi chú nếu có. `noteLines` = số dòng tối đa của ghi chú.
 */
export function importInfoRows(
  h: ImportInfoInput,
  opts: { supplierName: string | null; t: TFunction; noteLines?: number },
): ReviewInfoRowData[] {
  const { supplierName, t, noteLines = 1 } = opts
  const rows: ReviewInfoRowData[] = []
  if (supplierName) {
    rows.push({ key: 'supplier', label: t(`${F}.supplier`), value: supplierName })
  }
  rows.push(
    { key: 'invoiceCode', label: t(`${F}.invoiceCode`), value: h.invoiceCode, format: 'code' },
    { key: 'date', label: t(`${F}.date`), value: formatFullDate(h.date), format: 'numeric' },
    { key: 'code', label: t(`${F}.code`), value: h.code, format: 'code' },
  )
  if (h.purchaseOrder) {
    rows.push({
      key: 'purchaseOrder',
      label: t(`${F}.purchaseOrder`),
      value: h.purchaseOrder,
      format: 'code',
    })
  }
  if (h.note) rows.push({ key: 'note', label: t(`${F}.note`), value: h.note, lines: noteLines })
  return rows
}
