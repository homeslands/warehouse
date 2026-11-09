import type { ImportForm } from '@/entities/import-form'
import {
  baseKey,
  headerFromForm,
  IMPORT_HEADER_FIELDS,
  lineFromItem,
  lineKey,
  lineValues,
  normNote,
  round6,
  sameHeaderField,
  samePrice,
  sameQty,
  sortedItems,
  type ImportHeaderField,
  type LineBase,
  type LocalLine,
  type ReceiveDraft,
  type ReceiveHeader,
} from './draft'

/**
 * Server đổi một trường (so với `base` cũ) sang giá trị KHÁC giá trị đang có trên máy. Dòng thêm trên
 * máy (`base` null) coi mọi trường là "server đổi". Trường server đổi về đúng giá trị trên máy (vd
 * PATCH đã ghi nhưng mất phản hồi) là đã khớp, không phải xung đột. Đơn vị không xét: dòng khớp theo
 * khoá lúc tải nên server không đổi đơn vị của dòng.
 */
function conflicts(old: LocalLine, fresh: LineBase): boolean {
  const ob = old.base
  const qty = ob === null || !sameQty(ob.quantity, fresh.quantity)
  const price = ob === null || !samePrice(ob.unitPrice, fresh.unitPrice)
  const exp = ob === null || ob.expiryDate !== fresh.expiryDate
  const note = ob === null || normNote(ob.note) !== normNote(fresh.note)
  return (
    (qty && !sameQty(old.quantity, fresh.quantity)) ||
    (price && !samePrice(old.unitPrice, fresh.unitPrice)) ||
    (exp && old.expiryDate !== fresh.expiryDate) ||
    (note && normNote(old.note) !== normNote(fresh.note))
  )
}

/** Đơn vị người dùng đã đổi trên máy được giữ (kèm snapshot đơn vị nếu có). */
function unitOf(l: LocalLine): Pick<LocalLine, 'unitSlug' | 'unitName' | 'units'> {
  return { unitSlug: l.unitSlug, unitName: l.unitName, ...(l.units && { units: l.units }) }
}

export type ImportMergeResult = {
  draft: ReceiveDraft
  /** Tên vật tư của các dòng trên máy (có `base`) không còn trên server (bị xoá ở nơi khác). */
  removed: string[]
  /** Trường đầu phiếu đã sửa trên máy mà server cũng đổi sang giá trị khác → đã lấy của server. */
  headerConflicts: ImportHeaderField[]
}

/**
 * Gộp đầu phiếu từng trường như dòng: trường người dùng đã sửa (khác `headerBase`) giữ của máy; server
 * cũng đổi trường đó sang giá trị KHÁC giá trị trên máy → xung đột, lấy của server và báo. Trường còn
 * lại (và Bên bán) lấy của server. Không có `headerBase` (bản lưu cũ / phiếu mới) → lấy hết của server.
 */
function mergeHeader(
  local: ReceiveDraft,
  server: ReceiveHeader,
): { header: ReceiveHeader; conflicts: ImportHeaderField[] } {
  const base = local.headerBase ?? null
  if (!base) return { header: server, conflicts: [] }
  const header = { ...server }
  const conflicts: ImportHeaderField[] = []
  for (const f of IMPORT_HEADER_FIELDS) {
    if (sameHeaderField(f, local.header, base)) continue // không sửa trên máy
    if (sameHeaderField(f, server, base) || sameHeaderField(f, server, local.header)) {
      Object.assign(header, { [f]: local.header[f] })
    } else conflicts.push(f)
  }
  return { header, conflicts }
}

/**
 * Sau lệch version: tải lại phiếu, giữ dấu "đã kiểm" + phần đã sửa (đơn vị / số / giá / hạn / ghi chú)
 * của dòng còn trên server mà không xung đột (`conflicts`): giá trị trên máy giữ nguyên, `base` = số
 * server. Dòng xung đột → `base` mới, bỏ dấu kiểm, đánh dấu `changedOnServer` (giữ giá trị người dùng
 * đã gõ cho từng trường họ đã sửa, trường còn lại lấy của server). Dòng khớp theo khoá LÚC TẢI
 * (`baseKey`) nên đổi đơn vị trên máy vẫn là cùng một dòng. Đầu phiếu gộp từng trường (`mergeHeader`).
 * Không tự gửi lại.
 */
export function mergeAfterConflict(local: ReceiveDraft, fresh: ImportForm): ImportMergeResult {
  // Mỗi dòng trên máy chỉ khớp MỘT dòng server. Dòng có `base` khớp theo khoá lúc tải và được ưu tiên;
  // dòng thêm trên máy (`base` null) chỉ nhận dòng server mà không dòng có `base` nào nhận.
  const fromServer = new Map<string, LocalLine[]>()
  const added = new Map<string, LocalLine[]>()
  for (const l of local.lines) {
    const bucket = l.base === null ? added : fromServer
    const k = baseKey(l)
    bucket.set(k, [...(bucket.get(k) ?? []), l])
  }
  const matched = new Set<LocalLine>()
  const lines: LocalLine[] = []

  for (const item of sortedItems(fresh)) {
    const next = lineFromItem(item)
    const old = fromServer.get(next.key)?.shift() ?? added.get(next.key)?.shift()
    if (!old) {
      lines.push(next)
      continue
    }
    matched.add(old)
    if (!conflicts(old, next.base!)) {
      const merged = {
        ...next,
        ...lineValues(old),
        ...unitOf(old),
        checked: old.checked,
        changedOnServer: old.changedOnServer,
      }
      lines.push({ ...merged, key: lineKey(merged) })
      continue
    }
    // Dòng server đổi, hoặc dòng thêm trên máy mà server đã có: base mới, phải kiểm lại.
    const ob = old.base
    const quantity =
      ob === null || !sameQty(old.quantity, ob.quantity) ? old.quantity : next.quantity
    const unitPrice =
      ob === null || !samePrice(old.unitPrice, ob.unitPrice) ? old.unitPrice : next.unitPrice
    const expiryDate =
      ob === null || old.expiryDate !== ob.expiryDate ? old.expiryDate : next.expiryDate
    const note = ob === null || normNote(old.note) !== normNote(ob.note) ? old.note : next.note
    const merged = {
      ...next,
      ...unitOf(old),
      quantity,
      unitPrice,
      expiryDate,
      note,
      checked: false,
      changedOnServer: true,
    }
    lines.push({ ...merged, key: lineKey(merged) })
  }

  const removed: string[] = []
  for (const l of local.lines) {
    if (l.base === null) {
      // Dòng thêm trên máy: giữ, trừ khi server đã có đúng dòng đó (đã gộp ở trên).
      if (!matched.has(l)) lines.push(l)
    } else if (!matched.has(l)) removed.push(l.materialName)
  }

  const serverHeader = headerFromForm(fresh)
  const { header, conflicts: headerConflicts } = mergeHeader(local, serverHeader)
  return {
    draft: {
      formSlug: fresh.slug,
      version: fresh.version,
      header,
      headerBase: serverHeader,
      lines: uniqueKeys(lines, fresh),
      savedAt: Date.now(),
    },
    removed,
    headerConflicts,
  }
}

/**
 * Khoá dòng phải duy nhất. Dòng đổi đơn vị trên máy mà khoá mới trùng dòng khác (vd server vừa thêm
 * dòng đúng đơn vị đó) thì về lại đơn vị lúc tải (khoá = `baseKey`), bỏ dấu kiểm và đánh dấu
 * `changedOnServer` để kiểm lại. Còn trùng nữa (bản lưu hỏng) thì cộng số lượng vào dòng đầu.
 */
function uniqueKeys(lines: LocalLine[], fresh: ImportForm): LocalLine[] {
  const count = new Map<string, number>()
  for (const l of lines) count.set(l.key, (count.get(l.key) ?? 0) + 1)
  const server = new Map((fresh.items ?? []).map((i) => [lineKey(i), i]))
  const out: LocalLine[] = []
  const at = new Map<string, number>()
  for (let l of lines) {
    if ((count.get(l.key) ?? 0) > 1 && l.base !== null && l.unitSlug !== l.base.unitSlug) {
      const key = baseKey(l)
      l = {
        ...l,
        unitSlug: l.base.unitSlug,
        unitName: server.get(key)?.unitName ?? l.unitName,
        key,
        checked: false,
        changedOnServer: true,
      }
    }
    const i = at.get(l.key)
    if (i === undefined) {
      at.set(l.key, out.length)
      out.push(l)
    } else {
      const first = out[i]!
      out[i] = {
        ...first,
        quantity: round6(first.quantity + l.quantity),
        checked: false,
        changedOnServer: true,
      }
    }
  }
  return out
}
