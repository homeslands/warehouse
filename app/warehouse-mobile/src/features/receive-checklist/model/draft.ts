import type {
  AvailableUnit,
  ImportForm,
  ImportFormInput,
  ImportFormItemInput,
  ImportFormUpdateInput,
} from '@/entities/import-form'
import { round2, round6 } from '@/shared/lib/round'

import { deriveHeaderSupplier } from './supplier'

/** Tối đa số dòng một phiếu (`IMPORT_FORM_ITEMS_MAX` của backend). */
export const MAX_ITEMS = 200

export { round2, round6 }

export function lineKey(i: { materialSlug: string; unitSlug: string }): string {
  return `${i.materialSlug}|${i.unitSlug}`
}

/**
 * Giá trị trên phiếu đã tải; `null` ở `LocalLine.base` = dòng thêm trên máy. `unitSlug` = đơn vị lúc
 * tải (đổi đơn vị trên máy vẫn khớp đúng dòng server, xem `baseKey`).
 */
export type LineBase = {
  unitSlug: string
  quantity: number
  unitPrice: number
  expiryDate: string | null
  note: string | null
}

export type LocalLine = {
  key: string
  materialSlug: string
  unitSlug: string
  materialCode: string
  materialName: string
  unitName: string
  unitPrice: number
  supplierSlug: string | null
  /** Snapshot từ dòng trên phiếu, để màn hình hiện tên NCC suy ra cho đầu phiếu. */
  supplierName: string | null
  base: LineBase | null
  quantity: number
  expiryDate: string | null
  note: string | null
  checked: boolean
  changedOnServer: boolean
  /** Snapshot đơn vị của vật tư (dòng thêm từ bộ chọn / quét) để đổi đơn vị tại chỗ; tuỳ chọn. */
  units?: AvailableUnit[]
}

export type ReceiveHeader = {
  code: string
  invoiceCode: string
  date: string
  purchaseOrder: string | null
  note: string | null
  supplierSlug: string | null
  /** URL chứng từ đã tải lên; `null` = không có. */
  file: string | null
}

export type ReceiveDraft = {
  formSlug: string | 'new'
  version: number | null
  header: ReceiveHeader
  /**
   * Đầu phiếu trên server lúc tải (như `LocalLine.base` của dòng) — để biết trường nào người dùng đã
   * sửa trên máy khi gộp sau lệch version. `null` = phiếu mới (chưa có trên server). Bản lưu cũ chưa
   * có trường này được `load` gán bằng `header` (không phân biệt được phần đã sửa).
   */
  headerBase: ReceiveHeader | null
  lines: LocalLine[]
  savedAt: number
}

/**
 * Các trường đầu phiếu gộp từng trường sau lệch version, theo thứ tự hiện trên màn. Bên bán
 * (`supplierSlug`) KHÔNG gộp: phiếu đã có chỉ xem, luôn lấy theo server.
 */
export const IMPORT_HEADER_FIELDS = [
  'code',
  'invoiceCode',
  'date',
  'purchaseOrder',
  'note',
  'file',
] as const satisfies readonly (keyof ReceiveHeader)[]

export type ImportHeaderField = (typeof IMPORT_HEADER_FIELDS)[number]

/**
 * Ghi chú rỗng và `null` là một. Trường vắng (`undefined` — PO / ghi chú là tuỳ chọn trong phản hồi
 * của server) cũng là `null`.
 */
export function normNote(note: string | null | undefined): string | null {
  return !note || note.trim() === '' ? null : note
}

export function sameQty(a: number, b: number): boolean {
  return round6(a) === round6(b)
}

export function samePrice(a: number, b: number): boolean {
  return round2(a) === round2(b)
}

/** Một trường đầu phiếu bằng nhau (PO / ghi chú: rỗng và `null` là một). */
export function sameHeaderField(f: ImportHeaderField, a: ReceiveHeader, b: ReceiveHeader): boolean {
  return f === 'purchaseOrder' || f === 'note' ? normNote(a[f]) === normNote(b[f]) : a[f] === b[f]
}

function sameHeader(a: ReceiveHeader, b: ReceiveHeader): boolean {
  return IMPORT_HEADER_FIELDS.every((f) => sameHeaderField(f, a, b))
}

export function sameBase(a: LineBase, b: LineBase): boolean {
  return (
    a.unitSlug === b.unitSlug &&
    sameQty(a.quantity, b.quantity) &&
    samePrice(a.unitPrice, b.unitPrice) &&
    a.expiryDate === b.expiryDate &&
    normNote(a.note) === normNote(b.note)
  )
}

export function lineValues(l: LocalLine): LineBase {
  return {
    unitSlug: l.unitSlug,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    expiryDate: l.expiryDate,
    note: l.note,
  }
}

/** Khoá của dòng như lúc tải từ server (đơn vị lúc đó); dòng thêm trên máy thì là khoá hiện tại. */
export function baseKey(l: LocalLine): string {
  return lineKey({ materialSlug: l.materialSlug, unitSlug: l.base?.unitSlug ?? l.unitSlug })
}

/** Dòng cục bộ từ một dòng của phiếu (chưa kiểm, `base` = số trên phiếu). */
export function lineFromItem(item: NonNullable<ImportForm['items']>[number]): LocalLine {
  const base: LineBase = {
    unitSlug: item.unitSlug,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    expiryDate: item.expiryDate,
    note: item.note,
  }
  return {
    key: lineKey(item),
    materialSlug: item.materialSlug,
    materialCode: item.materialCode,
    materialName: item.materialName,
    unitName: item.unitName,
    supplierSlug: item.supplierSlug,
    supplierName: item.supplierName,
    base,
    ...base,
    checked: false,
    changedOnServer: false,
  }
}

export function headerFromForm(form: ImportForm): ReceiveHeader {
  return {
    code: form.code,
    invoiceCode: form.invoiceCode,
    date: form.date,
    purchaseOrder: form.purchaseOrder,
    note: form.note,
    supplierSlug: deriveHeaderSupplier((form.items ?? []).map((i) => i.supplierSlug)),
    file: form.file || null,
  }
}

/** Dòng theo `lineNo`; dòng thêm trên máy sau này được nối vào cuối. */
export function sortedItems(form: ImportForm) {
  return [...(form.items ?? [])].sort((a, b) => a.lineNo - b.lineNo)
}

export function draftFromForm(form: ImportForm): ReceiveDraft {
  return {
    formSlug: form.slug,
    version: form.version,
    header: headerFromForm(form),
    headerBase: headerFromForm(form),
    lines: sortedItems(form).map(lineFromItem),
    savedAt: Date.now(),
  }
}

/**
 * Khác phiếu đã tải ở đầu phiếu / đơn vị / số / giá / hạn / ghi chú / dòng thêm / dòng thiếu. Dấu "đã
 * kiểm" không tính.
 */
export function isDirty(draft: ReceiveDraft, form: ImportForm): boolean {
  const items = form.items ?? []
  if (draft.lines.length !== items.length) return true
  if (!sameHeader(draft.header, headerFromForm(form))) return true
  const byKey = new Map(items.map((i) => [lineKey(i), i]))
  return draft.lines.some((l) => {
    const item = byKey.get(l.key)
    if (!item || l.base === null) return true
    return !sameBase(lineValues(l), item)
  })
}

/**
 * Bản nháp có sửa thật so với phiếu lúc tải: đầu phiếu khác `headerBase`, dòng khác `base` (đơn vị /
 * số / giá / hạn / ghi chú), hoặc dòng thêm trên máy. Dấu "đã kiểm" không tính. Không có `headerBase`
 * (phiếu mới) thì chỉ xét dòng.
 */
export function hasEdits(draft: ReceiveDraft): boolean {
  const base = draft.headerBase
  if (base && !sameHeader(draft.header, base)) return true
  return draft.lines.some((l) => l.base === null || !sameBase(lineValues(l), l.base))
}

/** Dòng giữ lại khi lưu (số > 0). */
function kept(draft: ReceiveDraft): LocalLine[] {
  return draft.lines.filter((l) => round6(l.quantity) > 0)
}

/**
 * `items` của PATCH (thay toàn bộ dòng): bỏ dòng 0, luôn kèm `expiryDate` (kể cả `null`);
 * `supplierSlug` / `note` chỉ gửi khi có, như `toUpdateInput` của web.
 */
export function toUpdateItems(draft: ReceiveDraft): ImportFormItemInput[] {
  return kept(draft).map((l) => {
    const note = normNote(l.note)
    return {
      materialSlug: l.materialSlug,
      unitSlug: l.unitSlug,
      quantity: round6(l.quantity),
      unitPrice: round2(l.unitPrice),
      expiryDate: l.expiryDate,
      ...(l.supplierSlug !== null && { supplierSlug: l.supplierSlug }),
      ...(note !== null && { note: note.trim() }),
    }
  })
}

/** Đầu phiếu của body POST / PATCH. */
function headerInput(draft: ReceiveDraft, onServer: boolean): Omit<ImportFormInput, 'items'> {
  const { code, invoiceCode, date } = draft.header
  // Phiếu đã có trên server: PATCH bỏ trường vắng (`pickDefined`) nên xoá trắng phải gửi `''`.
  // Phiếu mới thì bỏ trường.
  const optional = (v: string | null) => {
    const n = normNote(v)
    return n !== null ? n.trim() : onServer ? '' : null
  }
  const purchaseOrder = optional(draft.header.purchaseOrder)
  const note = optional(draft.header.note)
  // PATCH chỉ gửi `file` khi khác gốc (URL mới, hoặc `''` khi gỡ): bản lưu cũ thiếu trường này không
  // được làm mất file trên server. Phiếu mới: có thì gửi.
  const { file } = draft.header
  const fileInput = onServer
    ? file !== (draft.headerBase?.file ?? null)
      ? (file ?? '')
      : null
    : file
  return {
    code,
    invoiceCode,
    date,
    ...(purchaseOrder !== null && { purchaseOrder }),
    ...(note !== null && { note }),
    ...(fileInput !== null && { file: fileInput }),
  }
}

/** Body POST tạo phiếu: đầu phiếu (PO / ghi chú trống = không gửi) + dòng (`toUpdateItems`). */
export function toCreateInput(draft: ReceiveDraft): ImportFormInput {
  return { ...headerInput(draft, false), items: toUpdateItems(draft) }
}

/**
 * Body PATCH phiếu đã có: đầu phiếu (PO / ghi chú trống gửi `''` để server xoá thật) + toàn bộ dòng
 * (`toUpdateItems`) + `version` của bản nháp.
 */
export function toUpdateInput(draft: ReceiveDraft): ImportFormUpdateInput {
  if (draft.version === null) throw new Error('toUpdateInput: phiếu chưa có trên server')
  return { ...headerInput(draft, true), items: toUpdateItems(draft), version: draft.version }
}

export type CanSave =
  | { ok: true }
  | {
      ok: false
      reason: 'allZero' | 'noLines' | 'missingQuantity' | 'tooMany' | 'expiryBeforeDate'
      keys?: string[]
    }

/**
 * Kiểm trước khi Lưu. Mặc định (checklist): dòng số 0 là "không nhận" — bỏ khi lưu, không còn dòng
 * nào → `allZero`. `zeroIsMissing` (màn soạn): không có dòng → `noLines`; dòng số ≤ 0 là chưa nhập số
 * → `missingQuantity` kèm khoá các dòng đó.
 */
export function canSave(
  draft: ReceiveDraft,
  {
    zeroIsMissing = false,
    addedZeroIsMissing = false,
  }: { zeroIsMissing?: boolean; addedZeroIsMissing?: boolean } = {},
): CanSave {
  // Màn duyệt / kiểm: chỉ dòng THÊM trên máy (`base === null`, vd từ bộ chọn nhiều vật tư, số ban đầu
  // 0) mà số ≤ 0 là chưa nhập — chặn, kẻo `kept` âm thầm bỏ nó. Dòng của server đặt 0 chủ ý vẫn là "bỏ".
  if (addedZeroIsMissing && !zeroIsMissing) {
    const missing = draft.lines.filter(
      (l) => l.base === null && (!Number.isFinite(l.quantity) || round6(l.quantity) <= 0),
    )
    if (missing.length > 0) {
      return { ok: false, reason: 'missingQuantity', keys: missing.map((l) => l.key) }
    }
  }
  if (zeroIsMissing) {
    if (draft.lines.length === 0) return { ok: false, reason: 'noLines' }
    const missing = draft.lines.filter(
      (l) => !Number.isFinite(l.quantity) || round6(l.quantity) <= 0,
    )
    if (missing.length > 0) {
      return { ok: false, reason: 'missingQuantity', keys: missing.map((l) => l.key) }
    }
  }
  const lines = kept(draft)
  if (lines.length === 0) return { ok: false, reason: 'allZero' }
  if (lines.length > MAX_ITEMS) return { ok: false, reason: 'tooMany' }
  // `YYYY-MM-DD` so sánh chuỗi đúng thứ tự thời gian.
  const bad = lines.filter((l) => l.expiryDate !== null && l.expiryDate < draft.header.date)
  if (bad.length > 0) {
    return { ok: false, reason: 'expiryBeforeDate', keys: bad.map((l) => l.key) }
  }
  return { ok: true }
}
