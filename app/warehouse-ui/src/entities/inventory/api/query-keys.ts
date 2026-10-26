import type { ListParams } from '@/shared/api/types'
import type { InventoryFilters } from '../model/types'

/** Mọi key của một kho nằm dưới `warehouse(w)` — gắn / tạo / gỡ invalidate một lần là đủ cả danh sách lẫn lịch sử. */
export const inventoryKeys = {
  all: ['inventory'] as const,
  warehouse: (warehouseSlug: string) => [...inventoryKeys.all, warehouseSlug] as const,
  list: (warehouseSlug: string, params: ListParams<InventoryFilters>) =>
    [...inventoryKeys.warehouse(warehouseSlug), 'list', params] as const,
  history: (warehouseSlug: string, materialSlug: string) =>
    [...inventoryKeys.warehouse(warehouseSlug), 'history', materialSlug] as const,
}
