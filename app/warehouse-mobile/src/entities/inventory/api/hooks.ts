import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { fetchAllInventory, fetchInventoryHistory, fetchMaterialBatches } from './inventory.api'
import { inventoryKeys } from './query-keys'

const STALE_TIME_MS = 30_000

// KHÔNG dùng `placeholderData: keepPreviousData` ở bất kỳ hook nào: key có warehouseSlug, nên giữ
// dữ liệu cũ nghĩa là hiện tồn kho A dưới tên kho B. Đổi kho → `data` là `undefined` tới khi về.

export function useInventory(warehouseSlug: string | undefined) {
  return useQuery({
    queryKey: inventoryKeys.list(warehouseSlug ?? ''),
    queryFn: () => fetchAllInventory(warehouseSlug as string),
    enabled: !!warehouseSlug,
    staleTime: STALE_TIME_MS,
  })
}

/** Cùng key với danh sách → dùng cache danh sách nếu còn tươi, nếu không thì tải danh sách mới. */
export function useInventoryItem(
  warehouseSlug: string | undefined,
  materialSlug: string | undefined,
) {
  return useQuery({
    queryKey: inventoryKeys.list(warehouseSlug ?? ''),
    queryFn: () => fetchAllInventory(warehouseSlug as string),
    enabled: !!warehouseSlug && !!materialSlug,
    staleTime: STALE_TIME_MS,
    select: (items) => items.find((i) => i.materialSlug === materialSlug),
  })
}

export function useMaterialBatches(
  warehouseSlug: string | undefined,
  materialSlug: string | undefined,
) {
  return useQuery({
    queryKey: inventoryKeys.batches(warehouseSlug ?? '', materialSlug ?? ''),
    queryFn: () => fetchMaterialBatches(warehouseSlug as string, materialSlug as string),
    enabled: !!warehouseSlug && !!materialSlug,
    staleTime: STALE_TIME_MS,
  })
}

export function useInventoryHistory(
  warehouseSlug: string | undefined,
  materialSlug: string | undefined,
) {
  return useInfiniteQuery({
    queryKey: inventoryKeys.history(warehouseSlug ?? '', materialSlug ?? ''),
    queryFn: ({ pageParam }) =>
      fetchInventoryHistory(warehouseSlug as string, materialSlug as string, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled: !!warehouseSlug && !!materialSlug,
    staleTime: STALE_TIME_MS,
  })
}
