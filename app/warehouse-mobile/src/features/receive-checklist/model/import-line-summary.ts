import type { TFunction } from 'i18next'

import type { ImportFormItem } from '@/entities/import-form'

import type { LocalLine } from './draft'
import { formatFullDate, formatMoney, formatQuantity, type FormatLocale } from '@/shared/lib/format'
import { lineAmount } from '@/shared/lib/line-amount'
import { round6 } from '@/shared/lib/round'
import {
  lineSummaryA11y,
  noteExcerpt,
  type LineSummary,
  type SummarySegment,
} from '@/shared/ui/compose'

export type ImportLineSummaryContext = {
  /** Ngày nhập của phiếu (`YYYY-MM-DD`): HSD trước ngày này → cảnh báo (mục thiếu của bước 2). */
  formDate: string
  t: TFunction
  locale: FormatLocale
}

/**
 * Nội dung dòng vật tư chỉ đọc của phiếu nhập (spec wizard-apple §6) — cùng luật thiếu với
 * `importMissing` (số ≤ 0, HSD trước ngày nhập; đơn giá trống KHÔNG thiếu):
 * - dòng 2: "12 thùng × 12.000 đ"; giá trống (0 đ) → "12 thùng · Chưa có giá" xám; thiếu số → cam "Chưa
 *   nhập số lượng";
 * - thành tiền: số 0 → "—", giá 0 → "0 đ", cả hai xám (phiếu nhập không bao giờ cam ở đây);
 * - dòng 3: "mã · HSD dd/MM/yyyy | Không HSD", dòng số 0 có trên server ("Không nhận" của checklist) thêm
 *   "Nhập số hoặc xoá dòng", rồi cảnh báo: "Đã đổi ở nơi khác — xem lại", "HSD trước ngày nhập" (cam);
 *   cuối cùng phần trích ghi chú của dòng (`noteExcerpt`, xám).
 */
export function importLineSummary(line: LocalLine, ctx: ImportLineSummaryContext): LineSummary {
  const { t, locale } = ctx
  const qty = formatQuantity(line.quantity, locale, 6)
  const unit = line.unitName
  const qtyMissing = !Number.isFinite(line.quantity) || round6(line.quantity) <= 0
  const noPrice = !(line.unitPrice > 0)
  const expiryBad = line.expiryDate !== null && line.expiryDate < ctx.formDate

  const line2 = qtyMissing
    ? t('importForms:wizard.row.missingQty')
    : noPrice
      ? t('importForms:wizard.row.qtyNoPrice', { qty, unit })
      : t('importForms:wizard.row.qtyPrice', {
          qty,
          unit,
          price: formatMoney(line.unitPrice, locale),
        })
  const amount = qtyMissing ? null : formatMoney(lineAmount(line.quantity, line.unitPrice), locale)

  const line3: SummarySegment[] = [
    { text: line.materialCode, tone: 'muted' },
    {
      text: line.expiryDate
        ? t('importForms:wizard.row.expiry', { date: formatFullDate(line.expiryDate) })
        : t('importForms:wizard.row.noExpiry'),
      tone: 'muted',
    },
  ]
  if (qtyMissing && line.base !== null) {
    line3.push({ text: t('importForms:wizard.zeroHint'), tone: 'muted' })
  }
  if (line.changedOnServer) {
    line3.push({ text: t('importForms:wizard.row.changed'), tone: 'warning' })
  }
  if (expiryBad) {
    line3.push({ text: t('importForms:wizard.row.expiryBeforeDate'), tone: 'warning' })
  }
  const note = noteExcerpt(line.note)
  if (note) line3.push({ text: note, tone: 'muted' })

  return {
    line2,
    line2Tone: qtyMissing ? 'warning' : noPrice ? 'muted' : 'normal',
    line3,
    amount: amount ?? '—',
    amountTone: amount === null || noPrice ? 'muted' : 'normal',
    missing: qtyMissing || expiryBad,
    a11y: lineSummaryA11y(line.materialName, line2, amount, line3),
  }
}

/** Dòng chỉ đọc của phiếu đã lưu (màn xem): `key` = slug dòng, không có gốc (`base`), chưa kiểm. */
export function importItemAsLine(item: ImportFormItem): LocalLine {
  return {
    key: item.slug,
    materialSlug: item.materialSlug,
    unitSlug: item.unitSlug,
    materialCode: item.materialCode,
    materialName: item.materialName,
    unitName: item.unitName,
    unitPrice: item.unitPrice,
    supplierSlug: item.supplierSlug,
    supplierName: item.supplierName,
    base: null,
    quantity: item.quantity,
    expiryDate: item.expiryDate,
    note: item.note,
    checked: false,
    changedOnServer: false,
  }
}
