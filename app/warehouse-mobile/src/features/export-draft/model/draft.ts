import type {
  ExportForm,
  ExportFormInput,
  ExportFormItem,
  ExportFormItemInput,
  ExportFormType,
} from '@/entities/export-form'
import { sumLineAmounts } from '@/shared/lib/line-amount'
import { round2, round6 } from '@/shared/lib/round'

/** Tối đa số dòng một phiếu (`EXPORT_FORM_ITEMS_MAX` của backend). */
export const MAX_ITEMS = 200

/** Khoá dòng = (vật tư, đơn vị, lô); trùng cả ba là trùng dòng (khớp backend). Lô tự động = `''`. */
export function exportLineKey(i: {
  materialSlug: string
  unitSlug: string
  batchSlug: string | null
}): string {
  return `${i.materialSlug}|${i.unitSlug}|${i.batchSlug ?? ''}`
}

/** Giá trị trên phiếu đã tải; `null` ở `ExportLine.base` = dòng thêm trên máy. */
export type ExportLineBase = {
  unitSlug: string
  quantity: number
  unitPrice: number | null
  batchSlug: string | null
  note: string | null
}

export type ExportLine = {
  key: string
  materialSlug: string
  materialCode: string
  materialName: string
  unitSlug: string
  unitName: string
  conversionRate: number
  quantity: number
  /** `null` = chưa nhập (bắt buộc trước khi Lưu). */
  unitPrice: number | null
  /** `null` = tự động (hệ thống lấy lô hạn sớm nhất khi gửi duyệt). */
  batchSlug: string | null
  batchExpiryDate: string | null
  note: string | null
  base: ExportLineBase | null
  changedOnServer?: boolean
}

export type ExportHeader = {
  code: string
  type: ExportFormType
  purchaseOrder: string
  invoiceCode: string | null
  receiver: string
  note: string | null
  /** URL chứng từ đã tải lên; `null` = không có. */
  file: string | null
}

export type ExportDraft = {
  /** `null` = phiếu mới chưa lên server. */
  version: number | null
  header: ExportHeader
  /**
   * Đầu phiếu trên server lúc tải (như `ExportLine.base` của dòng) — để biết trường nào người dùng
   * đã sửa trên máy khi gộp sau lệch version. `null` = phiếu mới (chưa có trên server). Bản lưu cũ
   * chưa có trường này được `load` gán bằng `header` (không phân biệt được phần đã sửa).
   */
  headerBase: ExportHeader | null
  lines: ExportLine[]
}

/** Các trường của đầu phiếu, theo thứ tự hiện trên màn. */
export const HEADER_FIELDS = [
  'code',
  'type',
  'purchaseOrder',
  'invoiceCode',
  'receiver',
  'note',
  'file',
] as const satisfies readonly (keyof ExportHeader)[]

export type ExportHeaderField = (typeof HEADER_FIELDS)[number]

/** Một trường đầu phiếu bằng nhau (HĐ / ghi chú: rỗng và `null` là một). */
export function sameHeaderField(f: ExportHeaderField, a: ExportHeader, b: ExportHeader): boolean {
  return f === 'invoiceCode' || f === 'note' ? normNote(a[f]) === normNote(b[f]) : a[f] === b[f]
}

/** Ghi chú rỗng và `null` là một. */
export function normNote(note: string | null): string | null {
  return note === null || note.trim() === '' ? null : note
}

export function sameQty(a: number, b: number): boolean {
  return round6(a) === round6(b)
}

export function samePrice(a: number | null, b: number | null): boolean {
  return a === null || b === null ? a === b : round2(a) === round2(b)
}

export function sameBase(a: ExportLineBase, b: ExportLineBase): boolean {
  return (
    sameQty(a.quantity, b.quantity) &&
    samePrice(a.unitPrice, b.unitPrice) &&
    a.batchSlug === b.batchSlug &&
    a.unitSlug === b.unitSlug &&
    normNote(a.note) === normNote(b.note)
  )
}

export function lineValues(l: ExportLine): ExportLineBase {
  return {
    unitSlug: l.unitSlug,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    batchSlug: l.batchSlug,
    note: l.note,
  }
}

/** Khoá của dòng như lúc tải từ server (đơn vị + lô lúc đó); dòng thêm trên máy thì là khoá hiện tại. */
export function baseKey(l: ExportLine): string {
  return l.base === null
    ? l.key
    : exportLineKey({ ...l, unitSlug: l.base.unitSlug, batchSlug: l.base.batchSlug })
}

export function lineFromItem(item: ExportFormItem): ExportLine {
  const base: ExportLineBase = {
    unitSlug: item.unitSlug,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    batchSlug: item.batchSlug,
    note: item.note,
  }
  return {
    key: exportLineKey(item),
    materialSlug: item.materialSlug,
    materialCode: item.materialCode,
    materialName: item.materialName,
    unitName: item.unitName,
    conversionRate: item.conversionRate,
    batchExpiryDate: item.batchExpiryDate,
    base,
    ...base,
  }
}

export function headerFromForm(form: ExportForm): ExportHeader {
  return {
    code: form.code,
    type: form.type,
    purchaseOrder: form.purchaseOrder,
    invoiceCode: form.invoiceCode,
    receiver: form.receiver,
    note: form.note,
    file: form.file || null,
  }
}

/** Dòng theo `lineNo`; dòng thêm trên máy sau này được nối vào cuối. */
export function sortedItems(form: ExportForm): ExportFormItem[] {
  return [...(form.items ?? [])].sort((a, b) => a.lineNo - b.lineNo)
}

export function draftFromForm(form: ExportForm): ExportDraft {
  return {
    version: form.version,
    header: headerFromForm(form),
    headerBase: headerFromForm(form),
    lines: sortedItems(form).map(lineFromItem),
  }
}

/** Bản nháp trắng của phiếu mới. */
export function newExportDraft(header: Partial<ExportHeader> = {}): ExportDraft {
  return {
    version: null,
    header: {
      code: '',
      type: 'PRODUCTION',
      purchaseOrder: '',
      invoiceCode: null,
      receiver: '',
      note: null,
      file: null,
      ...header,
    },
    headerBase: null,
    lines: [],
  }
}

function sameHeader(a: ExportHeader, b: ExportHeader): boolean {
  return HEADER_FIELDS.every((f) => sameHeaderField(f, a, b))
}

/** Khác phiếu đã tải ở đầu phiếu / số / giá / lô / ghi chú / dòng thêm / dòng thiếu. */
export function isDirty(draft: ExportDraft, form: ExportForm): boolean {
  const items = form.items ?? []
  if (draft.lines.length !== items.length) return true
  if (!sameHeader(draft.header, headerFromForm(form))) return true
  const byKey = new Map(items.map((i) => [exportLineKey(i), i]))
  return draft.lines.some((l) => {
    const item = byKey.get(l.key)
    return !item || l.base === null || !sameBase(lineValues(l), lineFromItem(item).base!)
  })
}

/**
 * Có sửa thật so với phiếu lúc tải: đầu phiếu khác `headerBase`, dòng khác `base`, hoặc dòng thêm trên
 * máy. Không có `headerBase` (phiếu mới / bản lưu cũ) thì chỉ xét dòng.
 */
export function hasEdits(draft: ExportDraft): boolean {
  const base = draft.headerBase
  if (base && !sameHeader(draft.header, base)) return true
  return draft.lines.some((l) => l.base === null || !sameBase(lineValues(l), l.base))
}

/**
 * `items` của POST / PATCH: bỏ `batchSlug` khi tự động, `note` khi rỗng; giá trống tính 0 (đã chặn
 * bởi `canSave`), 2 số lẻ; số lượng 6 số lẻ.
 */
export function toInput(draft: ExportDraft): ExportFormInput {
  const h = draft.header
  // Phiếu đã có trên server: PATCH bỏ trường vắng nên xoá trắng phải gửi `''`. Phiếu mới thì bỏ.
  const onServer = draft.version !== null
  const optional = (v: string | null) => {
    const n = normNote(v)
    return n !== null ? n.trim() : onServer ? '' : null
  }
  const invoiceCode = optional(h.invoiceCode)
  const note = optional(h.note)
  // PATCH chỉ gửi `file` khi khác gốc (URL mới, hoặc `''` khi gỡ): bản lưu cũ thiếu trường này không
  // được làm mất file trên server. Phiếu mới: có thì gửi.
  const file = onServer
    ? h.file !== (draft.headerBase?.file ?? null)
      ? (h.file ?? '')
      : null
    : h.file
  return {
    code: h.code.trim(),
    type: h.type,
    purchaseOrder: h.purchaseOrder.trim(),
    receiver: h.receiver.trim(),
    ...(invoiceCode !== null && { invoiceCode }),
    ...(note !== null && { note }),
    ...(file !== null && { file }),
    items: draft.lines.map((l): ExportFormItemInput => {
      const lineNote = normNote(l.note)
      return {
        materialSlug: l.materialSlug,
        unitSlug: l.unitSlug,
        quantity: round6(l.quantity),
        unitPrice: round2(l.unitPrice ?? 0),
        ...(l.batchSlug !== null && { batchSlug: l.batchSlug }),
        ...(lineNote !== null && { note: lineNote.trim() }),
      }
    }),
  }
}

export type CanSave =
  | { ok: true }
  | {
      ok: false
      reason: 'noLines' | 'missingPrice' | 'badQuantity' | 'tooMany' | 'duplicate'
      keys?: string[]
    }

export function canSave(draft: ExportDraft): CanSave {
  const { lines } = draft
  if (lines.length === 0) return { ok: false, reason: 'noLines' }
  if (lines.length > MAX_ITEMS) return { ok: false, reason: 'tooMany' }
  const badQty = lines.filter((l) => !Number.isFinite(l.quantity) || round6(l.quantity) <= 0)
  if (badQty.length > 0) {
    return { ok: false, reason: 'badQuantity', keys: badQty.map((l) => l.key) }
  }
  const noPrice = lines.filter(
    (l) => l.unitPrice === null || !Number.isFinite(l.unitPrice) || l.unitPrice < 0,
  )
  if (noPrice.length > 0) {
    return { ok: false, reason: 'missingPrice', keys: noPrice.map((l) => l.key) }
  }
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const l of lines) (seen.has(l.key) ? dup : seen).add(l.key)
  if (dup.size > 0) return { ok: false, reason: 'duplicate', keys: [...dup] }
  return { ok: true }
}

/**
 * Tổng tiền = Σ số lượng × đơn giá, giá trống tính 0; làm tròn 2 số lẻ từng dòng rồi cộng dồn,
 * như server (có thể lệch tối đa 0,01 ở vài trường hợp dấu phẩy động hiếm).
 */
export function linesTotal(lines: readonly ExportLine[]): number {
  return sumLineAmounts(lines)
}
