import type { ListParams } from '@/shared/api/types'
import type { MyWarehouseFilters, WarehouseFilters } from '../model/types'

/**
 * Mọi query key của kho sinh ra từ đây. Key lồng theo cấp nên
 * `invalidateQueries({ queryKey: warehouseKeys.all })` trúng mọi danh sách, chi tiết, "kho của tôi".
 */
export const warehouseKeys = {
  all: ['warehouses'] as const,
  lists: () => [...warehouseKeys.all, 'list'] as const,
  list: (params: ListParams<WarehouseFilters>) => [...warehouseKeys.lists(), params] as const,
  detail: (slug: string) => [...warehouseKeys.all, 'detail', slug] as const,
  mine: (params: ListParams<MyWarehouseFilters>) => [...warehouseKeys.all, 'mine', params] as const,
}
