import type { ImportFormFilters } from '../model/types'

/** Mọi key mang `warehouseSlug`: `invalidateQueries(['import-forms', wh])` làm mới gọn một kho. */
export const importFormKeys = {
  all: ['import-forms'] as const,
  warehouse: (warehouseSlug: string) => [...importFormKeys.all, warehouseSlug] as const,
  list: (warehouseSlug: string, filters: ImportFormFilters = {}) =>
    [...importFormKeys.warehouse(warehouseSlug), 'list', filters] as const,
  detail: (warehouseSlug: string, slug: string) =>
    [...importFormKeys.warehouse(warehouseSlug), 'detail', slug] as const,
  available: (warehouseSlug: string, query: string) =>
    [...importFormKeys.warehouse(warehouseSlug), 'available', query] as const,
  /** Các trang của bộ chọn vật tư (`useAvailableMaterialPages`, có thể rỗng = mọi vật tư). */
  availablePages: (warehouseSlug: string, query: string) =>
    [...importFormKeys.warehouse(warehouseSlug), 'available-pages', query] as const,
  suppliers: () => [...importFormKeys.all, 'suppliers'] as const,
}
