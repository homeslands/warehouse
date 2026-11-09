import type { ExportFormFilters } from '../model/types'

/** Mọi key mang `warehouseSlug`: `invalidateQueries(['export-forms', wh])` làm mới gọn một kho. */
export const exportFormKeys = {
  all: ['export-forms'] as const,
  warehouse: (warehouseSlug: string) => [...exportFormKeys.all, warehouseSlug] as const,
  list: (warehouseSlug: string, filters: ExportFormFilters = {}) =>
    [...exportFormKeys.warehouse(warehouseSlug), 'list', filters] as const,
  detail: (warehouseSlug: string, slug: string) =>
    [...exportFormKeys.warehouse(warehouseSlug), 'detail', slug] as const,
  recentReceivers: (warehouseSlug: string) =>
    [...exportFormKeys.warehouse(warehouseSlug), 'recent-receivers'] as const,
}
