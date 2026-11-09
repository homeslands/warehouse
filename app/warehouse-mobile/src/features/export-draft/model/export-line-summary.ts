import type { TFunction } from 'i18next'

import type { ExportFormItem } from '@/entities/export-form'

import type { ExportLine } from './draft'
import type { Shortage } from './shortage'
import { formatMoney, formatQuantity, type FormatLocale } from '@/shared/lib/format'
import { lineAmount } from '@/shared/lib/line-amount'
import { round6 } from '@/shared/lib/round'
import {
  lineSummaryA11y,
  noteExcerpt,
  type LineSummary,
  type SummarySegment,
} from '@/shared/ui/compose'

export type ExportLineSummaryContext = {
  /** "còn n" theo đơn vị dòng (`availableInLineUnit`); `null` = chưa biết. */
  available: number | null
  /** Nhãn lô đã chọn (`formatLotLabel`); `null` = lô tự động; `false` = không vẽ đoạn lô. */
  lotLabel: string | null | false
  /**
   * Dòng thiếu hàng sau lần gửi duyệt lỗi: chi tiết → "Thiếu n <đv>" / "Lô chỉ còn n <đv>"; `true` = chỉ
   * biết khoá dòng → "Không đủ hàng". Đỏ, thay cho "còn n".
   */
  shortage?: Shortage | true
  /** Tên đơn vị gốc (cho "= n <đv gốc>"); `null` = chưa biết. */
  baseUnitName: string | null
  /** Dòng trùng dòng khác (mục `duplicate` của `exportMissing`). */
  duplicate?: boolean
  t: TFunction
  locale: FormatLocale
}

/**
 * Nội dung dòng vật tư chỉ đọc của phiếu xuất (spec wizard-apple §6) — cùng luật thiếu với
 * `exportMissing` (số ≤ 0, đơn giá trống, trùng dòng):
 * - dòng 2: "12 bình × 12.000 đ"; thiếu → cam: chỉ thiếu giá "12 bình · Chưa nhập đơn giá" (giữ số — như
 *   "12 thùng · Chưa có giá" của phiếu nhập), thiếu số "Chưa nhập số lượng" / "Chưa nhập số lượng, đơn giá";
 * - thành tiền: chưa tính được → "—" cam;
 * - dòng 3: "mã · = n <đv gốc> · còn n <đv> (vượt → cam; thiếu hàng → đỏ thay) · Lô tự động | nhãn lô", rồi
 *   cảnh báo: "Đã đổi ở nơi khác — xem lại" (cam), trùng dòng (đỏ); cuối cùng phần trích ghi chú của
 *   dòng (`noteExcerpt`, xám).
 */
export function exportLineSummary(line: ExportLine, ctx: ExportLineSummaryContext): LineSummary {
  const { t, locale, available, shortage, baseUnitName } = ctx
  const qty = (n: number) => formatQuantity(n, locale, 6)
  const unit = line.unitName
  const qtyMissing = !Number.isFinite(line.quantity) || round6(line.quantity) <= 0
  const priceMissing =
    line.unitPrice === null || !Number.isFinite(line.unitPrice) || line.unitPrice < 0

  const line2 =
    qtyMissing && priceMissing
      ? t('exportForms:wizard.row.missingBoth')
      : qtyMissing
        ? t('exportForms:wizard.row.missingQty')
        : priceMissing
          ? t('exportForms:wizard.row.qtyNoPrice', { qty: qty(line.quantity), unit })
          : t('exportForms:wizard.row.qtyPrice', {
              qty: qty(line.quantity),
              unit,
              price: formatMoney(line.unitPrice!, locale),
            })
  const amount =
    qtyMissing || priceMissing
      ? null
      : formatMoney(lineAmount(line.quantity, line.unitPrice), locale)

  const line3: SummarySegment[] = [{ text: line.materialCode, tone: 'muted' }]
  if (line.conversionRate !== 1 && baseUnitName && !qtyMissing) {
    line3.push({
      text: t('exportForms:edit.row.inBase', {
        n: qty(round6(line.quantity * line.conversionRate)),
        unit: baseUnitName,
      }),
      tone: 'muted',
    })
  }
  if (shortage) {
    line3.push({
      text:
        shortage === true
          ? t('exportForms:wizard.short')
          : shortage.kind === 'stock'
            ? t('exportForms:edit.row.shortStock', { n: qty(shortage.missing), unit })
            : t('exportForms:edit.row.shortBatch', { n: qty(shortage.available), unit }),
      tone: 'destructive',
    })
  } else if (available !== null) {
    line3.push({
      text: t('exportForms:edit.row.available', { n: qty(available), unit }),
      tone: round6(line.quantity) > available ? 'warning' : 'muted',
    })
  }
  if (ctx.lotLabel !== false) {
    line3.push({ text: ctx.lotLabel ?? t('exportForms:wizard.row.autoLot'), tone: 'muted' })
  }
  if (line.changedOnServer) {
    line3.push({ text: t('exportForms:edit.row.changed'), tone: 'warning' })
  }
  if (ctx.duplicate) {
    line3.push({ text: t('exportForms:wizard.row.duplicate'), tone: 'destructive' })
  }
  const note = noteExcerpt(line.note)
  if (note) line3.push({ text: note, tone: 'muted' })

  return {
    line2,
    line2Tone: qtyMissing || priceMissing ? 'warning' : 'normal',
    line3,
    amount: amount ?? '—',
    amountTone: amount === null ? 'warning' : 'normal',
    missing: qtyMissing || priceMissing || !!ctx.duplicate,
    a11y: lineSummaryA11y(line.materialName, line2, amount, line3),
  }
}

/** Dòng chỉ đọc của phiếu đã lưu (màn xem): `key` = slug dòng, không có gốc (`base`). */
export function exportItemAsLine(item: ExportFormItem): ExportLine {
  return {
    key: item.slug,
    materialSlug: item.materialSlug,
    materialCode: item.materialCode,
    materialName: item.materialName,
    unitSlug: item.unitSlug,
    unitName: item.unitName,
    conversionRate: item.conversionRate,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    batchSlug: item.batchSlug,
    batchExpiryDate: item.batchExpiryDate,
    note: item.note,
    base: null,
  }
}
