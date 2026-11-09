import type { InventoryItem, InventoryUnit } from './types'

export { formatQuantity } from '@/shared/lib/format'

/** Đổi từ đơn vị gốc sang `unit`; làm tròn 6 chữ số để khử rác dấu phẩy động. */
export function toUnit(baseQuantity: number, unit: InventoryUnit): number {
  return Math.round((baseQuantity / unit.conversionRate) * 1e6) / 1e6
}

/** Đơn vị quy đổi không phải gốc, ưu tiên `conversionRate` lớn nhất. */
export function altUnit(item: InventoryItem): InventoryUnit | null {
  let best: InventoryUnit | null = null
  for (const u of item.units) {
    if (u.isBaseUnit) continue
    if (!best || u.conversionRate > best.conversionRate) best = u
  }
  return best
}
