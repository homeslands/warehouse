import type { ExportFormFilters, ExportFormStatus } from '../model/types'

/** Mọi key mang `warehouseSlug`: `invalidateQueries(['export-forms', wh])` làm mới gọn một kho. */
export const exportFormKeys = {
  all: ['export-forms'] as const,
  warehouse: (warehouseSlug: string) => [...exportFormKeys.all, warehouseSlug] as const,
  list: (warehouseSlug: string, filters: ExportFormFilters = {}) =>
    [...exportFormKeys.warehouse(warehouseSlug), 'list', filters] as const,
  /** Dưới tiền tố 'list' để mọi invalidate danh sách của kho làm mới luôn số đếm. */
  count: (warehouseSlug: string, status: ExportFormStatus, day?: string) =>
    [
      ...exportFormKeys.warehouse(warehouseSlug),
      'list',
      day ? { status, day, count: true } : { status, count: true },
    ] as const,
  /** Dưới tiền tố 'list' như `count`: tổng tiền theo khoảng ngày. */
  sum: (
    warehouseSlug: string,
    status: ExportFormStatus,
    range?: { startDate: string; endDate: string },
  ) =>
    [...exportFormKeys.warehouse(warehouseSlug), 'list', { status, ...range, sum: true }] as const,
  /** Phiếu đã xác nhận theo khoảng ngày (tab Tổng quan); dưới 'list' nên invalidate danh sách làm mới luôn. */
  period: (warehouseSlug: string, range: { startDate: string; endDate: string }) =>
    [...exportFormKeys.warehouse(warehouseSlug), 'list', { ...range, period: true }] as const,
  detail: (warehouseSlug: string, slug: string) =>
    [...exportFormKeys.warehouse(warehouseSlug), 'detail', slug] as const,
  recentReceivers: (warehouseSlug: string) =>
    [...exportFormKeys.warehouse(warehouseSlug), 'recent-receivers'] as const,
}
