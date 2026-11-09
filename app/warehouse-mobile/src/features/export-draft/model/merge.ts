import type { ExportForm } from '@/entities/export-form'
import { round6 } from '@/shared/lib/round'

import {
  baseKey,
  exportLineKey,
  HEADER_FIELDS,
  headerFromForm,
  lineFromItem,
  lineValues,
  normNote,
  samePrice,
  sameHeaderField,
  sameQty,
  sortedItems,
  type ExportDraft,
  type ExportHeader,
  type ExportHeaderField,
  type ExportLine,
  type ExportLineBase,
} from './draft'

/**
 * Server đổi một trường (so với `base` cũ) sang giá trị KHÁC giá trị đang có trên máy. Dòng thêm trên
 * máy (`base` null) coi mọi trường là "server đổi". Trường server đổi về đúng giá trị trên máy (vd
 * PATCH đã ghi nhưng mất phản hồi) là đã khớp, không phải xung đột.
 */
function conflicts(old: ExportLine, fresh: ExportLineBase): boolean {
  const ob = old.base
  const qty = ob === null || !sameQty(ob.quantity, fresh.quantity)
  const price = ob === null || !samePrice(ob.unitPrice, fresh.unitPrice)
  const batch = ob === null || ob.batchSlug !== fresh.batchSlug
  const note = ob === null || normNote(ob.note) !== normNote(fresh.note)
  return (
    (qty && !sameQty(old.quantity, fresh.quantity)) ||
    (price && !samePrice(old.unitPrice, fresh.unitPrice)) ||
    (batch && old.batchSlug !== fresh.batchSlug) ||
    (note && normNote(old.note) !== normNote(fresh.note))
  )
}

/** Đơn vị người dùng đã đổi trên máy được giữ (dòng khớp theo khoá lúc tải nên server không đổi đơn vị). */
function unitOf(l: ExportLine) {
  return { unitSlug: l.unitSlug, unitName: l.unitName, conversionRate: l.conversionRate }
}

export type MergeResult = {
  draft: ExportDraft
  /** Tên vật tư của các dòng trên máy không còn trên server (bị xoá / tách ở nơi khác). */
  removed: string[]
  /** Trường đầu phiếu đã sửa trên máy mà server cũng đổi sang giá trị khác → đã lấy của server. */
  headerConflicts: ExportHeaderField[]
}

/**
 * Gộp đầu phiếu từng trường như dòng: trường người dùng đã sửa (khác `headerBase`) giữ của máy; server
 * cũng đổi trường đó sang giá trị KHÁC giá trị trên máy → xung đột, lấy của server và báo. Trường còn
 * lại lấy của server. Không có `headerBase` (bản lưu cũ) → coi như không sửa, lấy hết của server.
 */
function mergeHeader(
  local: ExportDraft,
  server: ExportHeader,
): { header: ExportHeader; conflicts: ExportHeaderField[] } {
  const base = local.headerBase ?? null
  if (!base) return { header: server, conflicts: [] }
  const header = { ...server }
  const conflicts: ExportHeaderField[] = []
  for (const f of HEADER_FIELDS) {
    if (sameHeaderField(f, local.header, base)) continue // không sửa trên máy
    if (sameHeaderField(f, server, base) || sameHeaderField(f, server, local.header)) {
      Object.assign(header, { [f]: local.header[f] })
    } else conflicts.push(f)
  }
  return { header, conflicts }
}

/**
 * Sau lệch version: tải lại phiếu, giữ số đã sửa của dòng còn trên server mà không xung đột
 * (`conflicts`): giá trị trên máy giữ nguyên, `base` = số server. Dòng xung đột → `base` mới, đánh dấu
 * `changedOnServer`, trường người dùng đã sửa giữ giá trị họ gõ, trường còn lại lấy của server.
 * Dòng khớp theo khoá LÚC TẢI (`baseKey`) nên đổi lô trên máy vẫn là cùng một dòng. Đầu phiếu gộp
 * từng trường (`mergeHeader`). Không tự gửi lại.
 */
export function mergeAfterConflict(local: ExportDraft, fresh: ExportForm): MergeResult {
  // Mỗi dòng trên máy chỉ khớp MỘT dòng server. Dòng có `base` khớp theo khoá lúc tải và được ưu tiên;
  // dòng thêm trên máy (`base` null) chỉ nhận dòng server mà không dòng có `base` nào nhận.
  const fromServer = new Map<string, ExportLine[]>()
  const added = new Map<string, ExportLine[]>()
  for (const l of local.lines) {
    const bucket = l.base === null ? added : fromServer
    const k = baseKey(l)
    bucket.set(k, [...(bucket.get(k) ?? []), l])
  }
  const matched = new Set<ExportLine>()
  const lines: ExportLine[] = []

  for (const item of sortedItems(fresh)) {
    const next = lineFromItem(item)
    const old = fromServer.get(next.key)?.shift() ?? added.get(next.key)?.shift()
    if (!old) {
      lines.push(next)
      continue
    }
    matched.add(old)
    if (!conflicts(old, next.base!)) {
      // Giữ phần người dùng sửa; `base` = server. Lô thì kèm HSD của lô đang chọn.
      const sameBatch = old.batchSlug === next.batchSlug
      const merged = {
        ...next,
        ...lineValues(old),
        ...unitOf(old),
        batchExpiryDate: sameBatch ? next.batchExpiryDate : old.batchExpiryDate,
        ...(old.changedOnServer && { changedOnServer: true }),
      }
      lines.push({ ...merged, key: exportLineKey(merged) })
      continue
    }
    const ob = old.base
    const edited = (a: boolean) => ob === null || a
    const quantity = edited(!sameQty(old.quantity, ob?.quantity ?? NaN))
      ? old.quantity
      : next.quantity
    const unitPrice = edited(!samePrice(old.unitPrice, ob?.unitPrice ?? NaN))
      ? old.unitPrice
      : next.unitPrice
    const batchEdited = edited(old.batchSlug !== ob?.batchSlug)
    const batchSlug = batchEdited ? old.batchSlug : next.batchSlug
    const batchExpiryDate = batchEdited ? old.batchExpiryDate : next.batchExpiryDate
    const note = edited(normNote(old.note) !== normNote(ob?.note ?? null)) ? old.note : next.note
    const merged = {
      ...next,
      ...unitOf(old),
      quantity,
      unitPrice,
      batchSlug,
      batchExpiryDate,
      note,
      changedOnServer: true,
    }
    lines.push({ ...merged, key: exportLineKey(merged) })
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
      version: fresh.version,
      header,
      headerBase: serverHeader,
      lines: uniqueKeys(lines, fresh),
    },
    removed,
    headerConflicts,
  }
}

/**
 * Khoá dòng phải duy nhất. Dòng server đổi lô / đơn vị trên máy mà khoá mới trùng dòng khác (vd server vừa
 * thêm dòng đúng lô đó) thì về lại lô + đơn vị trên server (khoá = khoá `base`) và đánh dấu `changedOnServer`
 * để kiểm lại. Còn trùng nữa (dòng thêm trên máy trùng dòng khác) thì cộng số lượng vào dòng đầu.
 */
function uniqueKeys(lines: ExportLine[], fresh: ExportForm): ExportLine[] {
  const count = new Map<string, number>()
  for (const l of lines) count.set(l.key, (count.get(l.key) ?? 0) + 1)
  const server = new Map((fresh.items ?? []).map((i) => [exportLineKey(i), i]))
  const out: ExportLine[] = []
  const at = new Map<string, number>()
  for (let l of lines) {
    const moved =
      l.base !== null && (l.batchSlug !== l.base.batchSlug || l.unitSlug !== l.base.unitSlug)
    if ((count.get(l.key) ?? 0) > 1 && l.base !== null && moved) {
      const key = baseKey(l)
      const item = server.get(key)
      l = {
        ...l,
        unitSlug: l.base.unitSlug,
        unitName: item?.unitName ?? l.unitName,
        conversionRate: item?.conversionRate ?? l.conversionRate,
        batchSlug: l.base.batchSlug,
        batchExpiryDate: item?.batchExpiryDate ?? null,
        key,
        changedOnServer: true,
      }
    }
    const i = at.get(l.key)
    if (i === undefined) {
      at.set(l.key, out.length)
      out.push(l)
    } else {
      const first = out[i]!
      out[i] = { ...first, quantity: round6(first.quantity + l.quantity), changedOnServer: true }
    }
  }
  return out
}
