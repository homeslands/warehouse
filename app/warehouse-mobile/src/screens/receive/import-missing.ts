import type { TFunction } from 'i18next'

import { MAX_ITEMS, type ReceiveDraft } from '@/features/receive-checklist'
import type { MissingItem } from '@/shared/lib/missing'
import { round6 } from '@/shared/lib/round'

import { importHeaderErrors, type ImportHeaderErrors } from './import-header'

/** Thứ tự các ô đầu phiếu trên màn soạn. */
const HEADER_ORDER = [
  'supplier',
  'invoiceCode',
  'date',
  'code',
  'purchaseOrder',
  'note',
] as const satisfies readonly (keyof ImportHeaderErrors)[]

/**
 * Phần còn thiếu của phiếu nhập theo thứ tự màn hình: đầu phiếu → "chưa có dòng" → từng dòng (số
 * lượng, hạn dùng) → quá số dòng. Đơn giá để trống là hợp lệ (tính 0 đ) nên không bao giờ thiếu.
 */
export function importMissing(
  draft: ReceiveDraft,
  opts: { supplierRequired: boolean; isNew: boolean },
  t: TFunction,
): MissingItem[] {
  const out: MissingItem[] = []
  const errors = importHeaderErrors(draft.header, opts, t)
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
    // `YYYY-MM-DD` so sánh chuỗi đúng thứ tự thời gian (cùng luật `canSave`).
    if (l.expiryDate !== null && l.expiryDate < draft.header.date) {
      out.push({
        id: `line:${l.key}:expiry`,
        group: 'expiry',
        target: { kind: 'line', key: l.key, field: 'expiry' },
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
  return out
}

/** Nhãn nhóm cho `missingSummary`: "Bên bán", "2 số lượng"… */
export function importMissingLabel(t: TFunction): (group: string, n: number) => string {
  return (group, n) => t(`importForms:compose.missing.${group}`, { n, max: MAX_ITEMS })
}
