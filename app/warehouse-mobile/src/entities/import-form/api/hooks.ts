import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  fetchAvailableMaterials,
  fetchImportForm,
  fetchImportForms,
  fetchSuppliers,
} from './import-form.api'
import { importFormKeys } from './query-keys'
import type { ImportFormFilters } from '../model/types'

const STALE_TIME_MS = 30_000

// KHÔNG dùng `keepPreviousData`: key có warehouseSlug, giữ dữ liệu cũ nghĩa là hiện phiếu kho A
// dưới tên kho B.

export function useImportForms(warehouseSlug: string | undefined, filters: ImportFormFilters = {}) {
  return useInfiniteQuery({
    queryKey: importFormKeys.list(warehouseSlug ?? '', filters),
    queryFn: ({ pageParam }) =>
      fetchImportForms(warehouseSlug as string, { ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled: !!warehouseSlug,
    staleTime: STALE_TIME_MS,
  })
}

export function useImportForm(warehouseSlug: string | undefined, slug: string | undefined) {
  return useQuery({
    queryKey: importFormKeys.detail(warehouseSlug ?? '', slug ?? ''),
    queryFn: () => fetchImportForm(warehouseSlug as string, slug as string),
    enabled: !!warehouseSlug && !!slug,
    staleTime: STALE_TIME_MS,
  })
}

/** Chỉ tải khi có ít nhất 1 ký tự; trang đầu (50 vật tư) — người dùng thu hẹp bằng cách gõ thêm. */
export function useAvailableMaterials(warehouseSlug: string | undefined, query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: importFormKeys.available(warehouseSlug ?? '', q),
    queryFn: () => fetchAvailableMaterials(warehouseSlug as string, { query: q, page: 1 }),
    enabled: !!warehouseSlug && q.length >= 1,
    staleTime: STALE_TIME_MS,
  })
}

/** `enabled` = có `SUPPLIER_READ`. */
export function useSuppliers(enabled: boolean) {
  return useQuery({
    queryKey: importFormKeys.suppliers(),
    queryFn: fetchSuppliers,
    enabled,
    staleTime: 5 * 60_000,
  })
}

/**
 * Bộ chọn nhiều vật tư của phiếu nhập: các trang 50 vật tư, tải trang sau bằng `fetchNextPage` (cuộn tới
 * cuối). Ô tìm trống = mọi vật tư của kho (sắp theo mã).
 */
export function useAvailableMaterialPages(warehouseSlug: string | undefined, query: string) {
  const q = query.trim()
  return useInfiniteQuery({
    queryKey: importFormKeys.availablePages(warehouseSlug ?? '', q),
    queryFn: ({ pageParam }) =>
      fetchAvailableMaterials(warehouseSlug as string, { query: q, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled: !!warehouseSlug,
    staleTime: STALE_TIME_MS,
  })
}
