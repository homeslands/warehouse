import type { ListParams } from '@/shared/api/types'
import type { ExportFormFilters } from '../model/types'

/** Lồng theo kho: một lần invalidate `warehouse(w)` làm mới danh sách và chi tiết phiếu của kho đó. */
export const exportFormKeys = {
  all: ['export-forms'] as const,
  warehouse: (warehouseSlug: string) => [...exportFormKeys.all, warehouseSlug] as const,
  lists: (warehouseSlug: string) => [...exportFormKeys.warehouse(warehouseSlug), 'list'] as const,
  list: (warehouseSlug: string, params: ListParams<ExportFormFilters>) =>
    [...exportFormKeys.lists(warehouseSlug), params] as const,
  detail: (warehouseSlug: string, slug: string) =>
    [...exportFormKeys.warehouse(warehouseSlug), 'detail', slug] as const,
}
