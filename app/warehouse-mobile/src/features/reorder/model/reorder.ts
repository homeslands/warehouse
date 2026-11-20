import type { AvailableMaterial, AvailableSupplier } from '@/entities/import-form'
import type { InventoryItem } from '@/entities/inventory'
import { round6 } from '@/shared/lib/round'

/** Đỏ = tồn dưới Min; vàng = tồn từ Min tới Min × `YELLOW_FACTOR`. */
export type ReorderLevel = 'red' | 'yellow'

export const YELLOW_FACTOR = 1.2

/** Dấu "đã đặt" và số đã sửa tự hết sau chừng này ngày (store dọn — Task 2). */
export const MARK_TTL_DAYS = 7

/** Số cần đặt; `value` tính theo `unitSlug` (không phải đơn vị gốc). */
export type ReorderQty = { value: number; unitSlug: string }

/** Phần lưu trên máy của 1 vật tư. `orderedAt` = `yyyy-MM-dd`. */
export type ReorderLocal = {
  qty?: ReorderQty
  supplierSlug?: string
  orderedAt?: string
}

export type ReorderRow = {
  item: InventoryItem
  level: ReorderLevel
  /** Số gợi ý theo đơn vị gốc; `null` = không gợi ý được (chưa có Max, hoặc tồn đã đủ Max). */
  suggestedBase: number | null
  /** `local.qty` ?? gợi ý theo đơn vị gốc ?? `null`. */
  qty: ReorderQty | null
  orderedAt: string | null
  /** Bên bán của vật tư; `[]` khi không có dữ liệu bên bán. */
  suppliers: AvailableSupplier[]
}

export type ReorderGroup =
  | { kind: 'choose'; rows: ReorderRow[] }
  | { kind: 'supplier'; supplier: AvailableSupplier; rows: ReorderRow[] }
  | { kind: 'none'; rows: ReorderRow[] }
  | { kind: 'all'; rows: ReorderRow[] }

/**
 * Mức cần đặt: đỏ = hết hàng (`tồn <= 0`, kể cả chưa đặt Min) hoặc `min > 0 && tồn < min` — đúng
 * "Thiếu" = hết + dưới Min của tab Tồn kho / Tổng quan (`stockLevel`); vàng = `min > 0 && min <= tồn <=
 * min × 1,2`. Còn hàng mà Min ≤ 0 (chưa đặt ngưỡng) → `null`.
 */
export function reorderLevel(item: InventoryItem): ReorderLevel | null {
  const min = item.effectiveMinimumInventory
  if (item.quantity <= 0) return 'red'
  if (!(min > 0)) return null
  if (item.quantity < min) return 'red'
  // round6: 3 × 1,2 = 3,5999… không được đẩy tồn 3,6 ra ngoài vùng vàng.
  if (item.quantity <= round6(min * YELLOW_FACTOR)) return 'yellow'
  return null
}

/** Số gợi ý theo đơn vị gốc = ⌈max − tồn⌉ khi `max > 0`; kết quả ≤ 0 → `null`. */
export function suggestedBaseQty(item: InventoryItem): number | null {
  const max = item.effectiveMaximumInventory
  if (!(max > 0)) return null
  // round6 trước khi làm tròn lên: 1,1 − 0,1 = 1,0000000000000002 không được thành 2.
  const n = Math.ceil(round6(max - item.quantity))
  return n > 0 ? n : null
}

/** Khoá ổn định của nhóm: `choose` | `none` | `all` | `supplier-<slug>`. */
export function reorderGroupKey(group: ReorderGroup): string {
  return group.kind === 'supplier' ? `supplier-${group.supplier.slug}` : group.kind
}

const LEVEL_ORDER: Record<ReorderLevel, number> = { red: 0, yellow: 1 }

function compareRows(a: ReorderRow, b: ReorderRow): number {
  return (
    LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
    a.item.materialCode.localeCompare(b.item.materialCode, 'vi')
  )
}

function toRow(
  item: InventoryItem,
  level: ReorderLevel,
  local: ReorderLocal | undefined,
  suppliers: AvailableSupplier[],
): ReorderRow {
  const suggestedBase = suggestedBaseQty(item)
  const suggested =
    suggestedBase != null && item.baseUnit
      ? { value: suggestedBase, unitSlug: item.baseUnit.slug }
      : null
  // Đơn vị đã lưu bị gỡ khỏi vật tư (không còn trong `units`, không phải đơn vị gốc) → bỏ số đã sửa.
  const saved = local?.qty
  const savedValid =
    saved != null &&
    (saved.unitSlug === item.baseUnit?.slug ||
      item.units.some((u) => u.unitSlug === saved.unitSlug))
  return {
    item,
    level,
    suggestedBase,
    qty: savedValid ? saved : suggested,
    orderedAt: local?.orderedAt ?? null,
    suppliers,
  }
}

/**
 * Gom vật tư cần đặt theo nơi đặt:
 * - `materials` null (không quyền `IMPORT_FORM_CREATE` / chưa tải được) → đúng 1 nhóm `all`;
 * - 1 bên bán → nhóm bên bán đó; nhiều bên bán → nhóm bên bán đã chọn (`local.supplierSlug`, phải còn
 *   trong `suppliers`), chưa chọn / đã bị gỡ → `choose`; không bên bán (hoặc vật tư không có trong
 *   `materials`) → `none`.
 * Thứ tự nhóm: `choose`, bên bán theo tên (tiếng Việt), `none`. Trong nhóm: đỏ trước vàng, rồi mã vật
 * tư. Nhóm rỗng không xuất hiện; `includeYellow = false` bỏ dòng vàng.
 */
export function buildReorderGroups({
  items,
  materials,
  local,
  includeYellow,
}: {
  items: InventoryItem[]
  materials: AvailableMaterial[] | null
  /** Khoá = `materialSlug`. */
  local: Record<string, ReorderLocal>
  includeYellow: boolean
}): ReorderGroup[] {
  const suppliersOf = new Map<string, AvailableSupplier[]>()
  for (const m of materials ?? []) suppliersOf.set(m.slug, m.suppliers)

  const choose: ReorderRow[] = []
  const none: ReorderRow[] = []
  const all: ReorderRow[] = []
  const bySupplier = new Map<string, { supplier: AvailableSupplier; rows: ReorderRow[] }>()

  for (const item of items) {
    const level = reorderLevel(item)
    if (!level || (level === 'yellow' && !includeYellow)) continue
    const mine = local[item.materialSlug]

    if (!materials) {
      all.push(toRow(item, level, mine, []))
      continue
    }

    const suppliers = suppliersOf.get(item.materialSlug) ?? []
    const row = toRow(item, level, mine, suppliers)
    const target =
      suppliers.length === 1 ? suppliers[0] : suppliers.find((s) => s.slug === mine?.supplierSlug)

    if (suppliers.length === 0) none.push(row)
    else if (!target) choose.push(row)
    else {
      const group = bySupplier.get(target.slug)
      if (group) group.rows.push(row)
      else bySupplier.set(target.slug, { supplier: target, rows: [row] })
    }
  }

  if (!materials) return all.length ? [{ kind: 'all', rows: all.sort(compareRows) }] : []

  const groups: ReorderGroup[] = []
  if (choose.length) groups.push({ kind: 'choose', rows: choose.sort(compareRows) })
  const suppliers = [...bySupplier.values()].sort(
    (a, b) =>
      a.supplier.name.localeCompare(b.supplier.name, 'vi') ||
      a.supplier.slug.localeCompare(b.supplier.slug),
  )
  for (const { supplier, rows } of suppliers) {
    groups.push({ kind: 'supplier', supplier, rows: rows.sort(compareRows) })
  }
  if (none.length) groups.push({ kind: 'none', rows: none.sort(compareRows) })
  return groups
}
