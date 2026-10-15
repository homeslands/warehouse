import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiError } from '@/shared/api/types'
import { assignMaterialToWarehouse, createMaterialInWarehouse } from './inventory.api'
import { inventoryKeys } from './query-keys'
import type { InventoryItem, WarehouseMaterialInput } from '../model/types'

/**
 * Toast thành công do bên gọi tự hiện (câu khác nhau theo ca); lỗi do bên gọi xử lý (`suppressErrorToast`).
 * Invalidate chéo entity khác (vật tư khả dụng của phiếu nhập, danh mục vật tư, NCC) làm ở tầng feature.
 */
export function useAssignWarehouseMaterial() {
  const qc = useQueryClient()
  return useMutation<InventoryItem, ApiError, { warehouseSlug: string; materialSlug: string }>({
    mutationFn: ({ warehouseSlug, materialSlug }) =>
      assignMaterialToWarehouse(warehouseSlug, materialSlug),
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
    { warehouseSlug: string; material: WarehouseMaterialInput }
  >({
    mutationFn: ({ warehouseSlug, material }) => createMaterialInWarehouse(warehouseSlug, material),
    meta: { suppressErrorToast: true },
    onSuccess: (_, { warehouseSlug }) => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.warehouse(warehouseSlug) })
    },
  })
}
