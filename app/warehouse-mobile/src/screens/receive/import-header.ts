import type { TFunction } from 'i18next'

import type { ReceiveHeader } from '@/features/receive-checklist'
import { todayLocalIso } from '@/shared/lib/format'

/** `BUSINESS_CODE_REGEX` của backend (bản chép ở web `shared/lib/code.ts`). */
const BUSINESS_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/
export const REFERENCE_MAX = 64
export const CODE_MAX = 32

const two = (n: number) => String(n).padStart(2, '0')

/** Gợi ý mã theo giờ máy như web: `PN-yyyyMMdd-HHmm`. */
export function suggestCode(now: Date = new Date()): string {
  return `PN-${todayLocalIso(now).replace(/-/g, '')}-${two(now.getHours())}${two(now.getMinutes())}`
}

export type ImportHeaderErrors = Partial<
  Record<'code' | 'invoiceCode' | 'date' | 'purchaseOrder' | 'note' | 'supplier', string>
>

/**
 * Luật kiểm đầu phiếu nhập: mã (bắt buộc, đúng khuôn), số hoá đơn (bắt buộc, ≤ 64), PO (≤ 64),
 * bên bán (chỉ phiếu mới có danh sách bên bán). Ngày / ghi chú không có luật ở đầu phiếu.
 */
export function importHeaderErrors(
  h: ReceiveHeader,
  opts: { supplierRequired: boolean; isNew: boolean },
  t: TFunction,
): ImportHeaderErrors {
  const code = h.code.trim()
  const invoice = h.invoiceCode.trim()
  return {
    code:
      code === ''
        ? t('importForms:codeRequired')
        : !BUSINESS_CODE_REGEX.test(code)
          ? t('importForms:codeInvalid')
          : undefined,
    invoiceCode:
      invoice === ''
        ? t('importForms:invoiceCodeRequired')
        : invoice.length > REFERENCE_MAX
          ? t('importForms:referenceTooLong')
          : undefined,
    purchaseOrder:
      (h.purchaseOrder ?? '').trim().length > REFERENCE_MAX
        ? t('importForms:referenceTooLong')
        : undefined,
    supplier:
      opts.isNew && opts.supplierRequired && !h.supplierSlug
        ? t('importForms:supplierRequired')
        : undefined,
  }
}
