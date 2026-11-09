import type { TFunction } from 'i18next'

import type { ExportForm } from '@/entities/export-form'
import type { ReviewInfoRowData } from '@/shared/ui/compose'

export type ExportInfoInput = Pick<
  ExportForm,
  'type' | 'code' | 'purchaseOrder' | 'receiver' | 'invoiceCode' | 'note'
>

/**
 * Các dòng nhóm "Thông tin" của phiếu xuất — dùng chung bước 3 của form và màn xem: Loại, Mã phiếu,
 * Số PO (khi có), Người nhận, rồi Số HĐ / Ghi chú nếu có. `noteLines` = số dòng tối đa của ghi chú.
 */
export function exportInfoRows(
  h: ExportInfoInput,
  opts: { t: TFunction; noteLines?: number },
): ReviewInfoRowData[] {
  const { t, noteLines = 1 } = opts
  const rows: ReviewInfoRowData[] = [
    { key: 'type', label: t('exportForms:fields.type'), value: t(`exportForms:type.${h.type}`) },
    { key: 'code', label: t('exportForms:fields.code'), value: h.code, format: 'code' },
  ]
  if (h.purchaseOrder) {
    rows.push({
      key: 'purchaseOrder',
      label: t('exportForms:fields.purchaseOrder'),
      value: h.purchaseOrder,
      format: 'code',
    })
  }
  rows.push({ key: 'receiver', label: t('exportForms:fields.receiver'), value: h.receiver })
  if (h.invoiceCode) {
    rows.push({
      key: 'invoiceCode',
      label: t('exportForms:fields.invoiceCode'),
      value: h.invoiceCode,
      format: 'code',
    })
  }
  if (h.note) {
    rows.push({ key: 'note', label: t('exportForms:fields.note'), value: h.note, lines: noteLines })
  }
  return rows
}
