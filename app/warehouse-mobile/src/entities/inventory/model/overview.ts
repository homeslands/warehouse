import { stockLevel, type StockLevel } from './stock-level'
import type { InventoryItem } from './types'

export type StockOverview = { total: number } & Record<StockLevel, number>

/** Đếm vật tư theo mức tồn (hết hàng tính riêng, không tính vào dưới min) — thanh tổng quan cả kho. */
export function stockOverview(items: InventoryItem[]): StockOverview {
  const counts: StockOverview = { total: items.length, out: 0, low: 0, high: 0, ok: 0 }
  for (const i of items) counts[stockLevel(i)]++
  return counts
}

/** Thứ tự nghiêm trọng trong nhóm "Cần chú ý". */
const SEVERITY: Record<Exclude<StockLevel, 'ok'>, number> = { out: 0, low: 1, high: 2 }

/**
 * Chia danh sách thành "Cần chú ý" (hết → dưới min → vượt max) và "Bình thường". Sắp ổn định: trong
 * cùng mức giữ thứ tự đầu vào (đã xếp theo tên ở `filterInventory`).
 */
export function groupByAttention(items: InventoryItem[]): {
  attention: InventoryItem[]
  normal: InventoryItem[]
} {
  const attention: { item: InventoryItem; rank: number; at: number }[] = []
  const normal: InventoryItem[] = []
  items.forEach((item, at) => {
    const level = stockLevel(item)
    if (level === 'ok') normal.push(item)
    else attention.push({ item, rank: SEVERITY[level], at })
  })
  attention.sort((a, b) => a.rank - b.rank || a.at - b.at)
  return { attention: attention.map((a) => a.item), normal }
}
