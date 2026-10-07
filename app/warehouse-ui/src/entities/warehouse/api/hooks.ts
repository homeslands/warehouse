import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ApiError, ListParams } from '@/shared/api/types'
import {
  assignWarehouseManager,
  assignWarehouseMember,
  fetchAvailableMembers,
  removeWarehouseMember,
  createWarehouse,
  fetchWarehouse,
  fetchWarehouses,
  removeWarehouse,
  updateWarehouse,
} from './warehouse.api'
import { warehouseKeys } from './query-keys'
import type {
  AssignWarehouseManagerInput,
  Warehouse,
  WarehouseFilters,
  WarehouseInput,
  WarehouseUpdateInput,
} from '../model/types'

/**
 * `enabled` để nơi chỉ cần danh sách kho khi mở hộp thoại (gán kho cho cửa hàng) không phải tải
 * nó ngay lúc vào màn.
 */
export function useWarehouses(
  params: ListParams<WarehouseFilters>,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: warehouseKeys.list(params),
    queryFn: () => fetchWarehouses(params),
    enabled: options.enabled ?? true,
    // Chuyển trang vẫn hiện trang cũ tới khi trang mới về, thay vì nháy về khung chờ.
    placeholderData: keepPreviousData,
  })
}

function useInvalidateWarehouses() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: warehouseKeys.all })
}

export function useCreateWarehouse() {
  const invalidate = useInvalidateWarehouses()
  const { t } = useTranslation(['warehouses'])

  return useMutation<Warehouse, ApiError, WarehouseInput>({
    mutationFn: createWarehouse,
    // Form tự báo lỗi: mã/tên trùng hiện dưới đúng ô, phần còn lại form tự toastApiError.
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('warehouses:created'))
      invalidate()
    },
  })
}

export function useUpdateWarehouse() {
  const invalidate = useInvalidateWarehouses()
  const { t } = useTranslation(['warehouses'])

  return useMutation<Warehouse, ApiError, { slug: string; input: WarehouseUpdateInput }>({
    mutationFn: ({ slug, input }) => updateWarehouse(slug, input),
    // Dùng chung cho form sửa VÀ nút ngừng/mở hoạt động — bên gọi tự quyết hiện lỗi ở đâu.
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('warehouses:updated'))
      invalidate()
    },
  })
}

export function useDeleteWarehouse() {
  const invalidate = useInvalidateWarehouses()
  const { t } = useTranslation(['warehouses'])

  return useMutation<string, ApiError, string>({
    mutationFn: removeWarehouse,
    onSuccess: () => {
      toast.success(t('warehouses:deleted'))
      invalidate()
    },
  })
}

/**
 * Chi tiết một kho. `suppressErrorToast`: trang chi tiết tự báo 404/lỗi tại chỗ — và sau khi XOÁ từ
 * chính trang đó, lần tải lại bản ghi vừa xoá (do `invalidate(all)`) không được bắn toast 404 global.
 */
export function useWarehouse(slug: string) {
  return useQuery({
    queryKey: warehouseKeys.detail(slug),
    queryFn: () => fetchWarehouse(slug),
    meta: { suppressErrorToast: true },
  })
}

export function useAssignWarehouseManager() {
  const invalidate = useInvalidateWarehouses()
  const { t } = useTranslation(['warehouses'])

  return useMutation<Warehouse, ApiError, { slug: string; input: AssignWarehouseManagerInput }>({
    mutationFn: ({ slug, input }) => assignWarehouseManager(slug, input),
    // Dialog gán quản lý hiện 100514/100515/100516 ngay tại ô chọn.
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('warehouses:managerSaved'))
      invalidate()
    },
  })
}

/** Ứng viên thành viên: tải trang 1, `size: 100`; `enabled` để chỉ tải khi mở hộp thoại. */
export function useAvailableMembers(slug: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: warehouseKeys.availableMembers(slug),
    queryFn: () => fetchAvailableMembers(slug, { page: 1, size: 100 }),
    enabled: options.enabled ?? true,
    // Ứng viên đổi sau mỗi lần gán/gỡ (kể cả từ tab khác) — luôn tải lại khi mở hộp.
    staleTime: 0,
  })
}

type MemberVars = { slug: string; userSlug: string }

export function useAssignWarehouseMember() {
  const qc = useQueryClient()
  const { t } = useTranslation(['warehouses'])

  return useMutation<unknown, ApiError, MemberVars>({
    mutationFn: ({ slug, userSlug }) => assignWarehouseMember(slug, userSlug),
    // Dialog thêm thành viên hiện lỗi theo field ngay tại ô chọn.
    meta: { suppressErrorToast: true },
    onSuccess: (_data, { slug }) => {
      toast.success(t('warehouses:memberAdded'))
      qc.invalidateQueries({ queryKey: warehouseKeys.availableMembers(slug) })
    },
  })
}

export function useRemoveWarehouseMember() {
  const qc = useQueryClient()
  const { t } = useTranslation(['warehouses'])

  return useMutation<unknown, ApiError, MemberVars>({
    mutationFn: ({ slug, userSlug }) => removeWarehouseMember(slug, userSlug),
    onSuccess: (_data, { slug }) => {
      toast.success(t('warehouses:memberRemoved'))
      qc.invalidateQueries({ queryKey: warehouseKeys.availableMembers(slug) })
    },
  })
}
