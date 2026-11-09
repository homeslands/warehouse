import type { TFunction } from 'i18next'

import {
  importInfoRows,
  importLineSummary,
  linesTotal,
  type ReceiveDraft,
} from '@/features/receive-checklist'
import type { FormatLocale } from '@/shared/lib/format'
import { round2 } from '@/shared/lib/round'
import type { LineSummary, ReviewInfoRowData } from '@/shared/ui/compose'

/** Một dòng vật tư của bước 3: nội dung như dòng đọc của bước 2 (`importLineSummary`). */
export type ImportReviewLine = {
  key: string
  name: string
  summary: LineSummary
}

export type ImportReview = {
  infoRows: ReviewInfoRowData[]
  lines: ImportReviewLine[]
  /** Khối "Lưu ý" (rỗng → không vẽ). Phiếu nhập không kiểm tồn — chỉ có dòng đơn giá 0 đ. */
  warnings: string[]
  footnote: string
  total: number
}

/**
 * Dữ liệu tóm tắt chỉ đọc của bước 3 "Xác nhận" phiếu nhập (spec form-wizard §6; cùng khuôn
 * `exportReview`): nhóm Thông tin (`importInfoRows`), từng dòng vật tư (CÙNG nội dung với dòng đọc của bước 2 — `importLineSummary`), "Lưu ý" ở chân
 * nhóm ("n dòng có đơn giá 0 đ" — thay cho cảnh báo trong hộp hỏi Lưu trước đây) và câu ghi chú cuối. `supplierName` = tên bên bán như dòng Bên bán của bước 1
 * (`supplierRowFor`), `null` → không có dòng Bên bán.
 */
export function importReview(
  draft: ReceiveDraft,
  opts: { supplierName: string | null; t: TFunction; locale: FormatLocale },
): ImportReview {
  const { supplierName, t, locale } = opts
  const h = draft.header
  const P = 'importForms:wizard.review'

  const infoRows = importInfoRows(h, { supplierName, t, noteLines: 2 })

  let zero = 0
  const lines = draft.lines.map((l): ImportReviewLine => {
    if (round2(l.unitPrice) === 0) zero++
    return {
      key: l.key,
      name: l.materialName,
      summary: importLineSummary(l, { formDate: h.date, t, locale }),
    }
  })

  const warnings = zero > 0 ? [t(`${P}.zeroPrice`, { count: zero })] : []
  return { infoRows, lines, warnings, footnote: t(`${P}.footnote`), total: linesTotal(draft.lines) }
}
