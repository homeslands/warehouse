import type { InventoryItem } from './types'

export type StockLevel = 'out' | 'low' | 'high' | 'ok'

/**
 * BE tính `isAboveMaximum = quantity > effectiveMaximum` nên tối đa 0 (chưa đặt) cũng báo vượt;
 * app coi 0 là "chưa đặt ngưỡng" → chỉ vượt khi có tối đa > 0.
 */
export function isOverMaximum(item: InventoryItem): boolean {
  return item.isAboveMaximum && item.effectiveMaximumInventory > 0
}

export function stockLevel(item: InventoryItem): StockLevel {
  if (item.quantity <= 0) return 'out'
  if (item.isBelowMinimum) return 'low'
  if (isOverMaximum(item)) return 'high'
  return 'ok'
}
