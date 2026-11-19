import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  fetchExportForm,
  fetchExportFormCount,
  fetchExportFormSum,
  fetchConfirmedForms,
  fetchExportForms,
  RECENT_RECEIVERS_PAGE_SIZE,
} from './export-form.api'
import { exportFormKeys } from './query-keys'
import { recentReceivers } from '../model/receivers'
import type { ExportFormFilters, ExportFormStatus } from '../model/types'

const STALE_TIME_MS = 30_000

// KHÔNG dùng `keepPreviousData`: key có warehouseSlug, giữ dữ liệu cũ nghĩa là hiện phiếu kho A
// dưới tên kho B.

export function useExportForms(warehouseSlug: string | undefined, filters: ExportFormFilters = {}) {
  return useInfiniteQuery({
    queryKey: exportFormKeys.list(warehouseSlug ?? '', filters),
    queryFn: ({ pageParam }) =>
      fetchExportForms(warehouseSlug as string, { ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled: !!warehouseSlug,
    staleTime: STALE_TIME_MS,
  })
}

export function useExportForm(warehouseSlug: string | undefined, slug: string | undefined) {
  return useQuery({
    queryKey: exportFormKeys.detail(warehouseSlug ?? '', slug ?? ''),
    queryFn: () => fetchExportForm(warehouseSlug as string, slug as string),
    enabled: !!warehouseSlug && !!slug,
    staleTime: STALE_TIME_MS,
  })
}

/**
 * Người nhận gần đây của kho (gợi ý cho ô Người nhận): người nhận khác nhau của 50 phiếu xuất mới nhất,
 * mọi trạng thái, mới nhất trước (`recentReceivers`). `enabled`: nơi gọi bật cho loại không phải Chuyển kho — tải ngay khi bước 1 mở (không đợi chạm ô).
 */
export function useRecentReceivers(warehouseSlug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: exportFormKeys.recentReceivers(warehouseSlug ?? ''),
    queryFn: async () => {
      const page = await fetchExportForms(warehouseSlug as string, {
        page: 1,
        size: RECENT_RECEIVERS_PAGE_SIZE,
      })
      return recentReceivers(page.items)
    },
    enabled: enabled && !!warehouseSlug,
    staleTime: STALE_TIME_MS,
  })
}

/** Số phiếu của CẢ KHO theo trạng thái (1 request size=1). Không `keepPreviousData` (key có kho). */
export function useExportFormCount(
  warehouseSlug: string | undefined,
  status: ExportFormStatus,
  enabled: boolean,
) {
  return useQuery({
    queryKey: exportFormKeys.count(warehouseSlug ?? '', status),
    queryFn: () => fetchExportFormCount(warehouseSlug as string, status),
    enabled: enabled && !!warehouseSlug,
    staleTime: STALE_TIME_MS,
  })
}

/**
 * Tổng tiền phiếu của CẢ KHO theo trạng thái + khoảng ngày (đi hết các trang). `truncated` = chạm trần
 * trang, tổng không đủ. Không `keepPreviousData` (key có kho).
 */
export function useExportFormSum(
  warehouseSlug: string | undefined,
  status: ExportFormStatus,
  range: { startDate: string; endDate: string } | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: exportFormKeys.sum(warehouseSlug ?? '', status, range),
    queryFn: () => fetchExportFormSum(warehouseSlug as string, status, range),
    enabled: enabled && !!warehouseSlug,
    staleTime: STALE_TIME_MS,
  })
}

/**
 * Phiếu đã xác nhận trong khoảng ngày (đi hết các trang). Đổi KỲ cùng kho giữ dữ liệu cũ
 * (`isPlaceholderData`); đổi KHO thì không (`queryKey[1]` là slug kho) — không bao giờ hiện số kho cũ.
 */
export function useExportConfirmedForms(
  warehouseSlug: string | undefined,
  range: { startDate: string; endDate: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: exportFormKeys.period(warehouseSlug ?? '', range),
    queryFn: ({ signal }) => fetchConfirmedForms(warehouseSlug as string, range, signal),
    enabled: enabled && !!warehouseSlug,
    staleTime: STALE_TIME_MS,
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === (warehouseSlug ?? '') ? prev : undefined,
  })
}
