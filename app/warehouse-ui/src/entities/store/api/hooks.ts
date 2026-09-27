import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ApiError, ListParams } from '@/shared/api/types'
import {
  assignStoreWarehouse,
  createStore,
  fetchStore,
  fetchStores,
  removeStore,
  updateStore,
} from './store.api'
import { storeKeys } from './query-keys'
import type {
  AssignStoreWarehouseInput,
  Store,
  StoreFilters,
  StoreInput,
  StoreUpdateInput,
} from '../model/types'

export function useStores(params: ListParams<StoreFilters>) {
  return useQuery({
    queryKey: storeKeys.list(params),
    queryFn: () => fetchStores(params),
    // Chuyển trang vẫn hiện trang cũ tới khi trang mới về, thay vì nháy về khung chờ.
    placeholderData: keepPreviousData,
  })
}

function useInvalidateStores() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: storeKeys.all })
}

export function useCreateStore() {
  const invalidate = useInvalidateStores()
  const { t } = useTranslation(['stores'])

  return useMutation<Store, ApiError, StoreInput>({
    mutationFn: createStore,
    // Form tự báo lỗi tại ô (mã/tên/mã số thuế/email trùng hoặc sai định dạng).
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('stores:created'))
      invalidate()
    },
  })
}

export function useUpdateStore() {
  const invalidate = useInvalidateStores()
  const { t } = useTranslation(['stores'])

  return useMutation<Store, ApiError, { slug: string; input: StoreUpdateInput }>({
    mutationFn: ({ slug, input }) => updateStore(slug, input),
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('stores:updated'))
      invalidate()
    },
  })
}

export function useDeleteStore() {
  const invalidate = useInvalidateStores()
  const { t } = useTranslation(['stores'])

  return useMutation<string, ApiError, string>({
    mutationFn: removeStore,
    onSuccess: () => {
      toast.success(t('stores:deleted'))
      invalidate()
    },
  })
}

/** Chi tiết một cửa hàng — như `useWarehouse`, trang tự báo lỗi tại chỗ. */
export function useStore(slug: string) {
  return useQuery({
    queryKey: storeKeys.detail(slug),
    queryFn: () => fetchStore(slug),
    meta: { suppressErrorToast: true },
  })
}

/**
 * Chỉ tải lại danh sách CỬA HÀNG. Danh sách kho cũng cũ đi sau thao tác này (kho vừa bị chiếm chỗ
 * hoặc vừa được trả tự do), nhưng `entities/store` không được import `entities/warehouse` (cùng
 * tầng) — feature gọi hook này tự tải lại nốt danh sách kho.
 */
export function useAssignStoreWarehouse() {
  const invalidate = useInvalidateStores()
  const { t } = useTranslation(['stores'])

  return useMutation<Store, ApiError, { slug: string; input: AssignStoreWarehouseInput }>({
    mutationFn: ({ slug, input }) => assignStoreWarehouse(slug, input),
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('stores:warehouseSaved'))
      invalidate()
    },
  })
}
