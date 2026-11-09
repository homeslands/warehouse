import type { ImportForm } from '@/entities/import-form'

import {
  baseKey,
  IMPORT_HEADER_FIELDS,
  lineKey,
  normNote,
  round2,
  round6,
  samePrice,
  sameHeaderField,
  sameQty,
  sortedItems,
  type ImportHeaderField,
  type ReceiveDraft,
} from './draft'

/** Số kèm tên đơn vị của chính nó (đổi đơn vị: mỗi bên một đơn vị). */
export type QtyInUnit = { quantity: number; unit: string }

/**
 * Một thay đổi sẽ ghi đè phiếu, theo thứ tự dòng (đơn vị / số → giá → hạn dùng → ghi chú của cùng
 * dòng).
 */
export type SummaryChange =
  /** `from` null = dòng thêm trên máy. */
  | { kind: 'qty'; name: string; unit: string; from: number | null; to: number }
  /** Đổi đơn vị (màn soạn): số + đơn vị lúc tải → số + đơn vị mới. Thay cho mục "qty" của dòng. */
  | { kind: 'unit'; name: string; from: QtyInUnit; to: QtyInUnit }
  | { kind: 'price'; name: string; from: number; to: number }
  | { kind: 'expiry'; name: string; from: string | null; to: string | null }
  | { kind: 'note'; name: string }

export type Summary = {
  /** Dòng giữ nguyên đơn vị, số, giá, hạn dùng và ghi chú trên phiếu. */
  matched: number
  /** Trường đầu phiếu đã sửa so với lúc tải (`headerBase`), theo thứ tự ô trên màn. */
  header: ImportHeaderField[]
  changes: SummaryChange[]
  /** Dòng số 0 (checklist: "Không nhận") — bỏ khi lưu. */
  dropped: { name: string }[]
  /** Dòng có trên phiếu nhưng đã xoá trên máy (màn soạn) — PATCH thay toàn bộ dòng nên sẽ mất. */
  removed: { name: string }[]
  total: number
}

/**
 * Tóm tắt cho hộp xác nhận. `form` (phiếu trên server) để biết dòng đã xoá trên máy và tên đơn vị lúc
 * tải của dòng đổi đơn vị; phiếu mới thì bỏ. `total` cộng theo xu nguyên để không trôi dấu phẩy động.
 */
export function buildSummary(draft: ReceiveDraft, form?: ImportForm): Summary {
  const s: Summary = { matched: 0, header: [], changes: [], dropped: [], removed: [], total: 0 }
  const base = draft.headerBase
  if (base) s.header = IMPORT_HEADER_FIELDS.filter((f) => !sameHeaderField(f, draft.header, base))
  const items = form ? sortedItems(form) : []
  const itemByKey = new Map(items.map((i) => [lineKey(i), i]))

  let cents = 0
  for (const l of draft.lines) {
    const q = round6(l.quantity)
    if (q === 0) {
      s.dropped.push({ name: l.materialName })
      continue
    }
    cents += Math.round(round2(q * l.unitPrice) * 100)
    const name = l.materialName
    if (l.base === null) {
      // Dòng thêm: không có giá / hạn / ghi chú "cũ" để ghi đè.
      s.changes.push({ kind: 'qty', name, unit: l.unitName, from: null, to: q })
      continue
    }
    const before = s.changes.length
    if (l.unitSlug !== l.base.unitSlug) {
      const fromUnit =
        itemByKey.get(baseKey(l))?.unitName ??
        l.units?.find((u) => u.unitSlug === l.base?.unitSlug)?.unitName ??
        ''
      s.changes.push({
        kind: 'unit',
        name,
        from: { quantity: l.base.quantity, unit: fromUnit },
        to: { quantity: q, unit: l.unitName },
      })
    } else if (!sameQty(l.base.quantity, q)) {
      s.changes.push({ kind: 'qty', name, unit: l.unitName, from: l.base.quantity, to: q })
    }
    if (!samePrice(l.base.unitPrice, l.unitPrice)) {
      s.changes.push({ kind: 'price', name, from: l.base.unitPrice, to: round2(l.unitPrice) })
    }
    if (l.expiryDate !== l.base.expiryDate) {
      s.changes.push({ kind: 'expiry', name, from: l.base.expiryDate, to: l.expiryDate })
    }
    if (normNote(l.note) !== normNote(l.base.note)) s.changes.push({ kind: 'note', name })
    if (s.changes.length === before) s.matched++
  }

  // Dòng server không còn trong bản nháp (khớp theo khoá lúc tải, nên dòng đổi đơn vị vẫn khớp).
  const kept = new Set(draft.lines.filter((l) => l.base !== null).map(baseKey))
  for (const i of items) if (!kept.has(lineKey(i))) s.removed.push({ name: i.materialName })

  s.total = cents / 100
  return s
}
