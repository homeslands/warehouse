import type { ListParams } from '@/shared/api/types'
import type { StoreFilters } from '../model/types'

/**
 * Mọi query key của cửa hàng sinh ra từ đây. Key lồng theo cấp nên
 * `invalidateQueries({ queryKey: storeKeys.all })` trúng mọi danh sách, mọi bộ lọc, chi tiết.
 */
export const storeKeys = {
  all: ['stores'] as const,
  lists: () => [...storeKeys.all, 'list'] as const,
  list: (params: ListParams<StoreFilters>) => [...storeKeys.lists(), params] as const,
  detail: (slug: string) => [...storeKeys.all, 'detail', slug] as const,
}
