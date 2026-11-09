import type { TFunction } from 'i18next'

import {
  exportInfoRows,
  exportLineSummary,
  linesTotal,
  type ExportDraft,
  type ExportLine,
  type Shortage,
} from '@/features/export-draft'
import type { FormatLocale } from '@/shared/lib/format'
import { round2, round6 } from '@/shared/lib/round'
import type { LineSummary, ReviewInfoRowData } from '@/shared/ui/compose'

/** Danh sách tên trong câu báo / cảnh báo phải đọc được cả khi phiếu 200 dòng: tối đa bấy nhiêu tên. */
const NAMES_MAX = 8

/** "A, B, C" — quá `NAMES_MAX` tên thì "A, …, H … và n dòng khác". */
export function names(list: readonly string[], t: TFunction): string {
  const shown = list.slice(0, NAMES_MAX).join(', ')
  const rest = list.length - NAMES_MAX
  return rest > 0 ? t('exportForms:edit.actions.namesMore', { names: shown, n: rest }) : shown
}

/** Một dòng vật tư của bước 3: nội dung như dòng đọc của bước 2 (`exportLineSummary`). */
export type ExportReviewLine = {
  key: string
  name: string
  summary: LineSummary
}

export type ExportReview = {
  infoRows: ReviewInfoRowData[]
  lines: ExportReviewLine[]
  /** Khối "Lưu ý" (rỗng → không vẽ). */
  warnings: string[]
  footnote: string
  total: number
}

/**
 * Dữ liệu tóm tắt chỉ đọc của bước 3 "Xác nhận" (spec form-wizard §6, wizard-apple §8): nhóm Thông tin,
 * từng dòng vật tư (CÙNG nội dung với dòng đọc của bước 2 — `exportLineSummary`), "Lưu ý" ở chân nhóm
 * (thay cho cảnh báo trong hộp hỏi Gửi duyệt trước đây) và câu ghi chú cuối. `available(line)` = "còn n"
 * theo đơn vị dòng như bước 2 (`availableInLineUnit`; `null` = chưa biết → không cảnh báo);
 * `lotLabel(line)` = nhãn lô đã chọn (`formatLotLabel`), `null` = lô tự động; `shortage` / `baseUnitName`
 * như bước 2. Vượt tồn chỉ cảnh báo — backend kiểm khi gửi duyệt.
 */
export function exportReview(
  draft: ExportDraft,
  opts: {
    available: (line: ExportLine) => number | null
    lotLabel: (line: ExportLine) => string | null
    /** Thiếu hàng của dòng sau lần gửi duyệt lỗi (`useExportStepNotices.shortages`). */
    shortage?: (line: ExportLine) => Shortage | true | undefined
    /** Tên đơn vị gốc của vật tư (cho "= n <đv gốc>"); `null` = chưa biết. */
    baseUnitName?: (line: ExportLine) => string | null
    t: TFunction
    locale: FormatLocale
  },
): ExportReview {
  const { available, lotLabel, shortage, baseUnitName, t, locale } = opts
  const h = draft.header
  const P = 'exportForms:wizard.review'

  const infoRows = exportInfoRows(h, { t, noteLines: 2 })

  const zero: ExportLine[] = []
  const over: ExportLine[] = []
  const lines = draft.lines.map((l): ExportReviewLine => {
    const isZero = l.unitPrice !== null && round2(l.unitPrice) === 0
    const left = available(l)
    const isOver = left !== null && round6(l.quantity) > left
    if (isZero) zero.push(l)
    if (isOver) over.push(l)
    return {
      key: l.key,
      name: l.materialName,
      summary: exportLineSummary(l, {
        available: left,
        lotLabel: lotLabel(l),
        shortage: shortage?.(l),
        baseUnitName: baseUnitName?.(l) ?? null,
        t,
        locale,
      }),
    }
  })

  const warnings: string[] = []
  if (zero.length > 0) warnings.push(t(`${P}.zeroPrice`, { count: zero.length }))
  if (over.length > 0) {
    warnings.push(
      t(`${P}.overStock`, {
        count: over.length,
        names: names(
          over.map((l) => l.materialName),
          t,
        ),
      }),
    )
  }

  const count = draft.lines.length
  const auto = draft.lines.filter((l) => l.batchSlug === null).length
  const footnote =
    auto > 0 ? t(`${P}.footnote`, { count, auto }) : t(`${P}.footnotePicked`, { count })

  return { infoRows, lines, warnings, footnote, total: linesTotal(draft.lines) }
}
