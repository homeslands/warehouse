import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  fetchAllAvailableMaterials,
  fetchAvailableMaterials,
  fetchImportForm,
  fetchImportFormCount,
  fetchImportFormSum,
  fetchConfirmedForms,
  fetchImportForms,
  fetchSuppliers,
} from './import-form.api'
import { importFormKeys } from './query-keys'
import type { ImportFormFilters, ImportFormStatus } from '../model/types'

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

/**
 * Chỉ tải khi có ít nhất 1 ký tự (và `enabled`); trang đầu (50 vật tư) — người dùng thu hẹp bằng cách gõ
 * thêm.
 */
export function useAvailableMaterials(
  warehouseSlug: string | undefined,
  query: string,
  enabled = true,
) {
  const q = query.trim()
  return useQuery({
    queryKey: importFormKeys.available(warehouseSlug ?? '', q),
    queryFn: () => fetchAvailableMaterials(warehouseSlug as string, { query: q, page: 1 }),
    enabled: enabled && !!warehouseSlug && q.length >= 1,
    staleTime: STALE_TIME_MS,
  })
}

/** `enabled` = có `SUPPLIER_READ`. */
/**
 * Danh sách bên bán (cache 5 phút). `refreshOnOpen`: nơi NGƯỜI DÙNG CHỌN bên bán (bước 1 form tạo
 * phiếu, sheet chọn bên bán) — mỗi lần mở luôn tải lại ở nền (vẫn hiện cache ngay) để NCC vừa tạo ở nơi
 * khác (web) hiện ra; nơi chỉ tra tên thì dùng cache.
 */
export function useSuppliers(
  enabled: boolean,
  { refreshOnOpen = false }: { refreshOnOpen?: boolean } = {},
) {
  return useQuery({
    queryKey: importFormKeys.suppliers(),
    queryFn: fetchSuppliers,
    enabled,
    staleTime: 5 * 60_000,
    ...(refreshOnOpen ? { refetchOnMount: 'always' as const } : null),
  })
}

/**
 * Bộ chọn nhiều vật tư của phiếu nhập: tải HẾT vật tư của kho một lần (lọc / chia nhóm ở máy). Kho quá lớn
 * (chạm trần 50 trang) → `data.truncated` (bộ chọn chuyển sang tìm trên server khi gõ).
 */
export function useAllAvailableMaterials(warehouseSlug: string | undefined) {
  return useQuery({
    queryKey: importFormKeys.availableAll(warehouseSlug ?? ''),
    queryFn: () => fetchAllAvailableMaterials(warehouseSlug as string),
    enabled: !!warehouseSlug,
    staleTime: STALE_TIME_MS,
  })
}

/** Số phiếu của CẢ KHO theo trạng thái (1 request size=1). Không `keepPreviousData` (key có kho). */
export function useImportFormCount(
  warehouseSlug: string | undefined,
  status: ImportFormStatus,
  enabled: boolean,
) {
  return useQuery({
    queryKey: importFormKeys.count(warehouseSlug ?? '', status),
    queryFn: () => fetchImportFormCount(warehouseSlug as string, status),
    enabled: enabled && !!warehouseSlug,
    staleTime: STALE_TIME_MS,
  })
}

/**
 * Tổng tiền phiếu của CẢ KHO theo trạng thái + khoảng ngày (đi hết các trang). `truncated` = chạm trần
 * trang, tổng không đủ. Không `keepPreviousData` (key có kho).
 */
export function useImportFormSum(
  warehouseSlug: string | undefined,
  status: ImportFormStatus,
  range: { startDate: string; endDate: string } | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: importFormKeys.sum(warehouseSlug ?? '', status, range),
    queryFn: () => fetchImportFormSum(warehouseSlug as string, status, range),
    enabled: enabled && !!warehouseSlug,
    staleTime: STALE_TIME_MS,
  })
}

/**
 * Phiếu đã xác nhận trong khoảng ngày (đi hết các trang). Đổi KỲ cùng kho giữ dữ liệu cũ
 * (`isPlaceholderData`); đổi KHO thì không (`queryKey[1]` là slug kho) — không bao giờ hiện số kho cũ.
 */
export function useImportConfirmedForms(
  warehouseSlug: string | undefined,
  range: { startDate: string; endDate: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: importFormKeys.period(warehouseSlug ?? '', range),
    queryFn: ({ signal }) => fetchConfirmedForms(warehouseSlug as string, range, signal),
    enabled: enabled && !!warehouseSlug,
    staleTime: STALE_TIME_MS,
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === (warehouseSlug ?? '') ? prev : undefined,
  })
}
