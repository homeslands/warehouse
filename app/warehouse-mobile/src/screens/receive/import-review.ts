import type { TFunction } from 'i18next'

import {
  importInfoRows,
  importLineSummary,
  linesTotal,
  supplierNameLookup,
  willAttachToSupplier,
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
  /** "Khi lưu, n vật tư sẽ được gắn vào <NCC>." — vẽ như chú thích ngay trên `footnote`; null = không có. */
  supplierNote: string | null
  footnote: string
  total: number
}

/**
 * Dữ liệu tóm tắt chỉ đọc của bước 3 "Xác nhận" phiếu nhập (spec form-wizard §6; cùng khuôn
 * `exportReview`): nhóm Thông tin (`importInfoRows`), từng dòng vật tư (CÙNG nội dung với dòng đọc của bước 2 — `importLineSummary`), "Lưu ý" ở chân
 * nhóm ("n dòng có đơn giá 0 đ" — thay cho cảnh báo trong hộp hỏi Lưu trước đây) và câu ghi chú cuối. `supplierName` = tên bên bán như dòng Bên bán của bước 1
 * (`supplierRowFor`), `null` → không có dòng Bên bán. "Khi lưu, n vật tư sẽ được gắn vào <NCC>." đếm theo
 * bên bán CỦA DÒNG (`willAttachToSupplier` — đúng thứ được gửi), không theo đầu phiếu; các dòng đó cùng một
 * bên bán → tên tra theo slug (`supplierNameOf`, mặc định tra trong các dòng), khác nhau → "bên bán".
 */
export function importReview(
  draft: ReceiveDraft,
  opts: {
    supplierName: string | null
    supplierNameOf?: (slug: string) => string | null
    t: TFunction
    locale: FormatLocale
  },
): ImportReview {
  const { supplierName, t, locale } = opts
  const h = draft.header
  const P = 'importForms:wizard.review'
  const supplierNameOf = opts.supplierNameOf ?? supplierNameLookup({ lines: draft.lines })

  const infoRows = importInfoRows(h, { supplierName, t, noteLines: 2 })

  const attaching = draft.lines.filter(willAttachToSupplier)
  const attachSlugs = new Set(attaching.map((l) => l.supplierSlug))
  const [onlySlug] = attachSlugs.size === 1 ? [...attachSlugs] : [null]

  let zero = 0
  const lines = draft.lines.map((l): ImportReviewLine => {
    if (round2(l.unitPrice) === 0) zero++
    return {
      key: l.key,
      name: l.materialName,
      summary: importLineSummary(l, { formDate: h.date, t, locale, supplierNameOf }),
    }
  })

  const warnings = zero > 0 ? [t(`${P}.zeroPrice`, { count: zero })] : []
  const supplierNote =
    attaching.length > 0
      ? t(`${P}.newToSupplier`, {
          count: attaching.length,
          name: (onlySlug ? supplierNameOf(onlySlug) : null) ?? t(`${P}.supplierFallback`),
        })
      : null
  return {
    infoRows,
    lines,
    warnings,
    supplierNote,
    footnote: t(`${P}.footnote`),
    total: linesTotal(draft.lines),
  }
}
