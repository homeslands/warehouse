import type { TFunction } from 'i18next'

import { MAX_ITEMS, type ExportDraft } from '@/features/export-draft'
import type { MissingItem } from '@/shared/lib/missing'
import { round6 } from '@/shared/lib/round'

import { headerErrors, valuesOf, type HeaderErrors } from './ExportHeaderFields'

/** Thứ tự các ô đầu phiếu trên màn soạn (Loại và Ghi chú không có luật lỗi). */
const HEADER_ORDER = [
  'code',
  'purchaseOrder',
  'receiver',
  'invoiceCode',
] as const satisfies readonly (keyof HeaderErrors)[]

/**
 * Phần còn thiếu của phiếu xuất theo thứ tự màn hình: đầu phiếu → "chưa có dòng" → từng dòng (số
 * lượng, đơn giá — bắt buộc ở phiếu xuất) → quá số dòng → dòng trùng.
 */
export function exportMissing(draft: ExportDraft, t: TFunction): MissingItem[] {
  const out: MissingItem[] = []
  const errors = headerErrors(valuesOf(draft.header), t)
  for (const field of HEADER_ORDER) {
    if (errors[field]) {
      out.push({ id: `header:${field}`, group: field, target: { kind: 'header', field } })
    }
  }
  if (draft.lines.length === 0) {
    out.push({ id: 'lines', group: 'lines', target: { kind: 'lines' } })
  }
  for (const l of draft.lines) {
    if (!Number.isFinite(l.quantity) || round6(l.quantity) <= 0) {
      out.push({
        id: `line:${l.key}:quantity`,
        group: 'quantity',
        target: { kind: 'line', key: l.key, field: 'quantity' },
      })
    }
    if (l.unitPrice === null || !Number.isFinite(l.unitPrice) || l.unitPrice < 0) {
      out.push({
        id: `line:${l.key}:price`,
        group: 'price',
        target: { kind: 'line', key: l.key, field: 'price' },
      })
    }
  }
  if (draft.lines.length > MAX_ITEMS) {
    out.push({
      id: 'tooMany',
      group: 'tooMany',
      target: { kind: 'line', key: draft.lines[MAX_ITEMS]!.key, field: 'line' },
    })
  }
  const seen = new Set<string>()
  for (const l of draft.lines) {
    if (seen.has(l.key)) {
      out.push({
        id: `line:${l.key}:line`,
        group: 'duplicate',
        target: { kind: 'line', key: l.key, field: 'line' },
      })
    }
    seen.add(l.key)
  }
  return out
}

/** Nhãn nhóm cho `missingSummary`: "Người nhận", "2 đơn giá"… */
export function exportMissingLabel(t: TFunction): (group: string, n: number) => string {
  return (group, n) => t(`exportForms:compose.missing.${group}`, { n, max: MAX_ITEMS })
}
