import type { ListParams } from '@/shared/api/types'
import type { MaterialFilters } from '../model/types'

/**
 * Key lồng theo cấp. `conversions(slug)` bọc cả bảng quy đổi lẫn danh sách gắn được của một vật tư — gắn / sửa /
 * gỡ invalidate một lần là đủ.
 */
export const materialKeys = {
  all: ['materials'] as const,
  lists: () => [...materialKeys.all, 'list'] as const,
  list: (params: ListParams<MaterialFilters>) => [...materialKeys.lists(), params] as const,
  detail: (slug: string) => [...materialKeys.all, 'detail', slug] as const,
  conversions: (slug: string) => [...materialKeys.all, 'conversions', slug] as const,
  conversionList: (slug: string, params: ListParams) =>
    [...materialKeys.conversions(slug), 'list', params] as const,
  availableUnits: (slug: string) => [...materialKeys.conversions(slug), 'available'] as const,
}
