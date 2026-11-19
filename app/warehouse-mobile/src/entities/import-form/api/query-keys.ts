import type { ImportFormFilters, ImportFormStatus } from '../model/types'

/** Mọi key mang `warehouseSlug`: `invalidateQueries(['import-forms', wh])` làm mới gọn một kho. */
export const importFormKeys = {
  all: ['import-forms'] as const,
  warehouse: (warehouseSlug: string) => [...importFormKeys.all, warehouseSlug] as const,
  list: (warehouseSlug: string, filters: ImportFormFilters = {}) =>
    [...importFormKeys.warehouse(warehouseSlug), 'list', filters] as const,
  /** Dưới tiền tố 'list' để mọi invalidate danh sách của kho làm mới luôn số đếm. */
  count: (warehouseSlug: string, status: ImportFormStatus, day?: string) =>
    [
      ...importFormKeys.warehouse(warehouseSlug),
      'list',
      day ? { status, day, count: true } : { status, count: true },
    ] as const,
  /** Dưới tiền tố 'list' như `count`: tổng tiền theo khoảng ngày. */
  sum: (
    warehouseSlug: string,
    status: ImportFormStatus,
    range?: { startDate: string; endDate: string },
  ) =>
    [...importFormKeys.warehouse(warehouseSlug), 'list', { status, ...range, sum: true }] as const,
  /** Phiếu đã xác nhận theo khoảng ngày (tab Tổng quan); dưới 'list' nên invalidate danh sách làm mới luôn. */
  period: (warehouseSlug: string, range: { startDate: string; endDate: string }) =>
    [...importFormKeys.warehouse(warehouseSlug), 'list', { ...range, period: true }] as const,
  detail: (warehouseSlug: string, slug: string) =>
    [...importFormKeys.warehouse(warehouseSlug), 'detail', slug] as const,
  available: (warehouseSlug: string, query: string) =>
    [...importFormKeys.warehouse(warehouseSlug), 'available', query] as const,
  /**
   * Mọi vật tư của kho cho bộ chọn (`useAllAvailableMaterials`); key thứ 3 PHẢI là 'available' để
   * `invalidateAfterMaterialWrite` làm mới. Phần tử cuối là object (không phải chuỗi) để không trùng
   * `available(wh, 'all')` (tìm từ khoá "all").
   */
  availableAll: (warehouseSlug: string) =>
    [...importFormKeys.warehouse(warehouseSlug), 'available', { all: true }] as const,
  /** Tiền tố mọi key vật tư của kho (tìm + tải hết) — làm mới sau khi lưu phiếu (liên kết NCC đổi). */
  availablePrefix: (warehouseSlug: string) =>
    [...importFormKeys.warehouse(warehouseSlug), 'available'] as const,
  suppliers: () => [...importFormKeys.all, 'suppliers'] as const,
}
