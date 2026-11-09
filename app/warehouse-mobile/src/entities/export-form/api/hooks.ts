import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { fetchExportForm, fetchExportForms, RECENT_RECEIVERS_PAGE_SIZE } from './export-form.api'
import { exportFormKeys } from './query-keys'
import { recentReceivers } from '../model/receivers'
import type { ExportFormFilters } from '../model/types'

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
 * mọi trạng thái, mới nhất trước (`recentReceivers`). `enabled`: nơi gọi chỉ bật khi cần (ô đã focus).
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
