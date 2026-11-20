import type { TFunction } from 'i18next'

import { formatQuantity, type InventoryItem } from '@/entities/inventory'
import { formatFullDate, todayLocalIso, type FormatLocale } from '@/shared/lib/format'

import type { ReorderGroup, ReorderRow } from './reorder'

/**
 * Dòng được đưa vào chữ chia sẻ: bỏ dòng đã đặt (`orderedAt`) và dòng chưa có số (`qty` null hoặc ≤ 0).
 * Nhóm `choose` (chưa chọn nơi đặt) không bao giờ chia sẻ → `[]`.
 */
export function shareableRows(group: ReorderGroup): ReorderRow[] {
  if (group.kind === 'choose') return []
  return group.rows.filter((r) => r.orderedAt == null && r.qty != null && r.qty.value > 0)
}

/** Tên đơn vị theo `unitSlug`: tìm trong `units`, rồi tới đơn vị gốc; không thấy → rỗng. */
function unitName(item: InventoryItem, unitSlug: string): string {
  const u = item.units.find((x) => x.unitSlug === unitSlug)
  if (u) return u.unitName
  return item.baseUnit?.slug === unitSlug ? item.baseUnit.name : ''
}

/**
 * Chữ gửi bên bán (Share của react-native):
 * ```
 * Đề xuất đặt hàng — <kho> — dd/MM/yyyy
 * Gửi: <bên bán>            (bỏ khi supplierName null)
 * 1. <tên> (<mã>) — <số> <đơn vị>
 * ```
 * `rows` nên đã qua `shareableRows`; dòng `qty` null vẫn bị bỏ qua để chắc chắn.
 */
export function reorderShareText({
  warehouseName,
  date,
  supplierName,
  rows,
  t,
  locale,
}: {
  warehouseName: string
  date: Date
  supplierName: string | null
  rows: ReorderRow[]
  t: TFunction
  locale: string
}): string {
  const fmtLocale: FormatLocale = locale === 'en' ? 'en' : 'vi'
  const lines = [
    t('inventory:reorder.share.header', {
      warehouse: warehouseName,
      date: formatFullDate(todayLocalIso(date)),
    }),
  ]
  if (supplierName != null) lines.push(t('inventory:reorder.share.to', { supplier: supplierName }))
  let index = 0
  for (const r of rows) {
    if (!r.qty) continue
    index += 1
    const line = t('inventory:reorder.share.line', {
      index,
      name: r.item.materialName,
      code: r.item.materialCode,
      qty: formatQuantity(r.qty.value, fmtLocale),
      unit: unitName(r.item, r.qty.unitSlug),
    })
    lines.push(line.trimEnd())
  }
  return lines.join('\n')
}
