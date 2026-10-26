import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { ApiError, ListParams } from '@/shared/api/types'
import {
  assignMaterialToWarehouse,
  createMaterialInWarehouse,
  fetchInventoryHistory,
  fetchWarehouseInventory,
  removeWarehouseMaterial,
} from './inventory.api'
import { inventoryKeys } from './query-keys'
import type {
  InventoryFilters,
  InventoryItem,
  InventoryThresholdInput,
  WarehouseMaterialInput,
} from '../model/types'

const HISTORY_PAGE_SIZE = 20

export function useWarehouseInventory(
  warehouseSlug: string,
  params: ListParams<InventoryFilters>,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: inventoryKeys.list(warehouseSlug, params),
    queryFn: () => fetchWarehouseInventory(warehouseSlug, params),
    placeholderData: keepPreviousData,
    enabled: (options.enabled ?? true) && warehouseSlug !== '',
  })
}

/** Lịch sử tồn, mới nhất trước, "Xem thêm" từng 20 dòng. Lỗi (100801…) sheet tự hiện — không toast. */
export function useInventoryHistory(
  warehouseSlug: string,
  materialSlug: string | null,
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: inventoryKeys.history(warehouseSlug, materialSlug ?? ''),
    queryFn: ({ pageParam }) =>
      fetchInventoryHistory(warehouseSlug, materialSlug ?? '', {
        page: pageParam,
        size: HISTORY_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled: (options.enabled ?? true) && materialSlug !== null,
    meta: { suppressErrorToast: true },
  })
}

/** Lỗi do bên gọi xử lý (100807 / 100813 / 100801 / 100804); invalidate chéo entity khác ở tầng feature. */
export function useRemoveWarehouseMaterial() {
  const qc = useQueryClient()
  return useMutation<unknown, ApiError, { warehouseSlug: string; materialSlug: string }>({
    mutationFn: ({ warehouseSlug, materialSlug }) =>
      removeWarehouseMaterial(warehouseSlug, materialSlug),
    meta: { suppressErrorToast: true },
    onSuccess: (_, { warehouseSlug }) => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.warehouse(warehouseSlug) })
    },
  })
}

/**
 * Toast thành công do bên gọi tự hiện (câu khác nhau theo ca); lỗi do bên gọi xử lý (`suppressErrorToast`).
 * Invalidate chéo entity khác (vật tư khả dụng của phiếu nhập, danh mục vật tư, NCC) làm ở tầng feature.
 */
export function useAssignWarehouseMaterial() {
  const qc = useQueryClient()
  return useMutation<
    InventoryItem,
    ApiError,
    { warehouseSlug: string; materialSlug: string; thresholds?: InventoryThresholdInput }
  >({
    mutationFn: ({ warehouseSlug, materialSlug, thresholds }) =>
      assignMaterialToWarehouse(warehouseSlug, materialSlug, thresholds),
    meta: { suppressErrorToast: true },
    onSuccess: (_, { warehouseSlug }) => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.warehouse(warehouseSlug) })
    },
  })
}

export function useCreateWarehouseMaterial() {
  const qc = useQueryClient()
  return useMutation<
    InventoryItem,
    ApiError,
    { warehouseSlug: string; material: WarehouseMaterialInput; supplierSlug?: string }
  >({
    mutationFn: ({ warehouseSlug, material, supplierSlug }) =>
      createMaterialInWarehouse(warehouseSlug, material, supplierSlug),
    meta: { suppressErrorToast: true },
    onSuccess: (_, { warehouseSlug }) => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.warehouse(warehouseSlug) })
    },
  })
}
