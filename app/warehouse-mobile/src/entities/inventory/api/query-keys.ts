import type { InventoryFilters } from './inventory.api'

/** Mọi key mang `warehouseSlug`: đổi kho là một mục cache khác, và `invalidateQueries(['inventory', wh])` xoá gọn một kho. */
export const inventoryKeys = {
  warehouse: (warehouseSlug: string) => ['inventory', warehouseSlug] as const,
  list: (warehouseSlug: string, filters: InventoryFilters = {}) =>
    ['inventory', warehouseSlug, 'list', filters] as const,
  batches: (warehouseSlug: string, materialSlug: string) =>
    ['inventory', warehouseSlug, 'batches', materialSlug] as const,
  history: (warehouseSlug: string, materialSlug: string) =>
    ['inventory', warehouseSlug, 'history', materialSlug] as const,
}
