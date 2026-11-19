import type { InventoryItem, MaterialBatch } from '@/entities/inventory'
import {
  availableInLineUnit,
  lineSerials,
  MAX_ITEMS,
  useExportDraft,
  type ExportDraft,
  type ExportLine,
} from '@/features/export-draft'
import { matchCode, parseLabel, type ParsedLabel } from '@/features/scan-material'
import { round6 } from '@/shared/lib/round'

import { baseUnitOf, newLineFrom } from './line-fields'

/** Thông tin lô theo `batchSlug` (map của `useLotInfo`); không có → không biết tồn của lô. */
export type LotOf = (batchSlug: string) => MaterialBatch | undefined

/**
 * Nhãn của một lần quét: nguyên chuỗi khớp một mã vật tư của tồn (mã có `*`) → nhãn chỉ Mã, không serial;
 * không thì tách `<MÃ>*<SERIAL>` (`parseLabel`).
 */
export function readLabel(text: string, stock: InventoryItem[]): ParsedLabel {
  const whole = text.trim()
  const key = whole.toUpperCase()
  const exact = key !== '' && stock.some((i) => i.materialCode.trim().toUpperCase() === key)
  return exact ? { code: whole, serial: null } : parseLabel(whole)
}

export type ScanError =
  | { kind: 'error'; reason: 'notFound'; code: string }
  /** `key` / `materialName`: dòng đã có serial này. */
  | { kind: 'error'; reason: 'duplicateSerial'; serial: string; materialName: string; key: string }
  | { kind: 'error'; reason: 'noUnit' | 'full'; materialName: string }
  /** `available`: số dòng đích được giữ tối đa, theo đơn vị của dòng. */
  | {
      kind: 'error'
      reason: 'overStock'
      materialName: string
      unitName: string
      available: number
    }

export type ScanPlan =
  | { kind: 'add'; line: ExportLine }
  | { kind: 'update'; key: string; patch: { quantity: number; serials: string[] } }
  | ScanError

/**
 * Một lần quét vào phiếu xuất (spec §4), thuần: khớp vật tư của tồn kho theo Mã → serial trùng ở BẤT KỲ
 * dòng nào → vật tư chưa có đơn vị → dòng đích (cùng vật tư, đơn vị gốc; ưu tiên lô tự động, không có
 * thì lô bất kỳ đầu tiên; không có → dòng mới, phiếu đủ 200 dòng thì `full`) → tồn (`availableInLineUnit`;
 * không biết thì cho qua, server kiểm khi gửi) → +1 (đơn vị gốc) và nối serial nếu có.
 */
export function planScan(
  draft: ExportDraft,
  label: ParsedLabel,
  stock: InventoryItem[],
  lotOf: LotOf,
): ScanPlan {
  const match = label.code === '' ? null : matchCode(label.code, stock)
  if (match?.kind !== 'found') return { kind: 'error', reason: 'notFound', code: label.code }
  const item = match.item

  const { serial } = label
  if (serial !== null) {
    const owner = draft.lines.find((l) => lineSerials(l).includes(serial))
    if (owner) {
      return {
        kind: 'error',
        reason: 'duplicateSerial',
        serial,
        materialName: owner.materialName,
        key: owner.key,
      }
    }
  }

  const unit = baseUnitOf(item)
  const fresh = newLineFrom(item)
  if (!unit || !fresh) return { kind: 'error', reason: 'noUnit', materialName: item.materialName }

  const sameBase = draft.lines.filter(
    (l) => l.materialSlug === item.materialSlug && l.unitSlug === unit.unitSlug,
  )
  const existing = sameBase.find((l) => l.batchSlug === null) ?? sameBase[0]
  if (!existing && draft.lines.length >= MAX_ITEMS) {
    return { kind: 'error', reason: 'full', materialName: item.materialName }
  }
  // Dòng mới ảo (số lượng 0) cũng kiểm tồn như dòng đã có.
  const target = existing ?? fresh
  const batch = target.batchSlug === null ? undefined : lotOf(target.batchSlug)
  const available = availableInLineUnit(target, item, batch, draft.lines)
  const quantity = round6(target.quantity + 1)
  if (available !== null && quantity > available) {
    return {
      kind: 'error',
      reason: 'overStock',
      materialName: item.materialName,
      unitName: target.unitName,
      available,
    }
  }

  const serials = serial === null ? lineSerials(target) : [...lineSerials(target), serial]
  if (!existing) {
    return { kind: 'add', line: { ...fresh, quantity, ...(serials.length > 0 && { serials }) } }
  }
  return { kind: 'update', key: existing.key, patch: { quantity, serials } }
}

/** Lỗi của `applyScan` cho UI: lý do của `planScan` + `code` = Mã đọc được (thiếu Mã → chuỗi gốc). */
type ScanFailure<E> = E extends { kind: 'error' }
  ? Omit<E, 'kind'> & { ok: false; code: string }
  : never

export type ScanOutcome =
  | {
      ok: true
      key: string
      materialName: string
      materialCode: string
      /** Số lượng mới của dòng (đơn vị của dòng). */
      quantity: number
      unitName: string
      serial: string | null
    }
  /** Chưa có bản nháp / đang Lưu – Gửi duyệt (store chặn ghi). */
  | { ok: false; reason: 'busy' }
  | ScanFailure<ScanError>

/**
 * Áp một lần quét vào bản nháp phiếu xuất đang mở (`useExportDraft`): `parseLabel` → `planScan` →
 * `addLine` / `updateLine`. Trả kết quả để sheet quét hiện. Store từ chối ghi → `busy`.
 */
export function applyScan(text: string, stock: InventoryItem[], lotOf: LotOf): ScanOutcome {
  const store = useExportDraft.getState()
  const { draft } = store
  if (!draft || store.saving) return { ok: false, reason: 'busy' }
  const label = readLabel(text, stock)
  const plan = planScan(draft, label, stock, lotOf)
  if (plan.kind === 'error') {
    const { kind: _, ...rest } = plan
    return { ...rest, ok: false, code: label.code || text.trim() }
  }
  const change =
    plan.kind === 'add' ? store.addLine(plan.line) : store.updateLine(plan.key, plan.patch)
  if (!change.ok) return { ok: false, reason: 'busy' }
  const line = useExportDraft.getState().draft?.lines.find((l) => l.key === change.key)
  if (!line) return { ok: false, reason: 'busy' }
  return {
    ok: true,
    key: line.key,
    materialName: line.materialName,
    materialCode: line.materialCode,
    quantity: line.quantity,
    unitName: line.unitName,
    serial: label.serial,
  }
}
