import type { ListParams } from '@/shared/api/types'
import type { ImportFormFilters } from '../model/types'

/** Lồng theo kho: một lần invalidate `warehouse(w)` làm mới danh sách, chi tiết và vật tư khả dụng của kho đó. */
export const importFormKeys = {
  all: ['import-forms'] as const,
  warehouse: (warehouseSlug: string) => [...importFormKeys.all, warehouseSlug] as const,
  lists: (warehouseSlug: string) => [...importFormKeys.warehouse(warehouseSlug), 'list'] as const,
  list: (warehouseSlug: string, params: ListParams<ImportFormFilters>) =>
    [...importFormKeys.lists(warehouseSlug), params] as const,
  detail: (warehouseSlug: string, slug: string) =>
    [...importFormKeys.warehouse(warehouseSlug), 'detail', slug] as const,
  available: (warehouseSlug: string) =>
    [...importFormKeys.warehouse(warehouseSlug), 'available'] as const,
}
