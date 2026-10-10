import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ApiError, ListParams } from '@/shared/api/types'
import {
  attachSupplierMaterials,
  createSupplier,
  createSupplierTransaction,
  detachSupplierMaterials,
  fetchSupplier,
  fetchSupplierMaterials,
  fetchSupplierTransactions,
  fetchSuppliers,
  removeSupplier,
  updateSupplier,
} from './supplier.api'
import { supplierKeys } from './query-keys'
import type {
  Supplier,
  SupplierFilters,
  SupplierInput,
  SupplierMaterial,
  SupplierMaterialFilters,
  SupplierTransaction,
  SupplierTransactionFilters,
  SupplierTransactionInput,
  SupplierUpdateInput,
} from '../model/types'

export function useSuppliers(params: ListParams<SupplierFilters>) {
  return useQuery({
    queryKey: supplierKeys.list(params),
    queryFn: () => fetchSuppliers(params),
    placeholderData: keepPreviousData,
  })
}

/** Chi tiết một nhà cung cấp — trang tự báo lỗi tại chỗ. */
export function useSupplier(slug: string) {
  return useQuery({
    queryKey: supplierKeys.detail(slug),
    queryFn: () => fetchSupplier(slug),
    meta: { suppressErrorToast: true },
  })
}

function useInvalidateSuppliers() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: supplierKeys.all })
}

export function useCreateSupplier() {
  const invalidate = useInvalidateSuppliers()
  const { t } = useTranslation(['suppliers'])

  return useMutation<Supplier, ApiError, SupplierInput>({
    mutationFn: createSupplier,
    // Form tự báo lỗi tại ô (mã trùng, định dạng sai...).
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('suppliers:created'))
      invalidate()
    },
  })
}

export function useUpdateSupplier() {
  const invalidate = useInvalidateSuppliers()
  const { t } = useTranslation(['suppliers'])

  return useMutation<Supplier, ApiError, { slug: string; input: SupplierUpdateInput }>({
    mutationFn: ({ slug, input }) => updateSupplier(slug, input),
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('suppliers:updated'))
      invalidate()
    },
  })
}

export function useDeleteSupplier() {
  const qc = useQueryClient()
  const { t } = useTranslation(['suppliers'])

  return useMutation<string, ApiError, string>({
    mutationFn: removeSupplier,
    // Hộp xoá tự báo lỗi 101211 (còn vật tư) tại chỗ.
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('suppliers:deleted'))
      // Chỉ danh sách: invalidate `all` sẽ tải lại detail/materials/transactions của bản ghi vừa xoá
      // (đang có observer ở trang chi tiết) → 404 + toast. Trang chi tiết tự gỡ cache của slug khi unmount.
      qc.invalidateQueries({ queryKey: supplierKeys.lists() })
    },
  })
}

export function useSupplierMaterials(
  slug: string,
  params: ListParams<SupplierMaterialFilters>,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...supplierKeys.materials(slug), params],
    queryFn: () => fetchSupplierMaterials(slug, params),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  })
}

/** Toàn bộ vật tư của nhà cung cấp (trang 1, `size: 100`) cho ô chọn / loại trừ vật tư đã gắn. */
export function useAllSupplierMaterials(slug: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...supplierKeys.materials(slug), { page: 1, size: 100 }],
    queryFn: () => fetchSupplierMaterials(slug, { page: 1, size: 100 }),
    enabled: options.enabled ?? true,
  })
}

type MaterialVars = { slug: string; materialSlugs: string[] }

export function useAttachSupplierMaterial() {
  const qc = useQueryClient()
  const { t } = useTranslation(['suppliers'])

  return useMutation<SupplierMaterial[], ApiError, MaterialVars>({
    mutationFn: ({ slug, materialSlugs }) => attachSupplierMaterials(slug, materialSlugs),
    // Hộp gắn vật tư hiện lỗi ngay tại ô chọn.
    meta: { suppressErrorToast: true },
    onSuccess: (_data, { slug, materialSlugs }) => {
      toast.success(t('suppliers:materialAttached', { count: materialSlugs.length }))
      qc.invalidateQueries({ queryKey: supplierKeys.materials(slug) })
    },
  })
}

export function useDetachSupplierMaterial() {
  const qc = useQueryClient()
  const { t } = useTranslation(['suppliers'])

  return useMutation<string, ApiError, MaterialVars>({
    mutationFn: ({ slug, materialSlugs }) => detachSupplierMaterials(slug, materialSlugs),
    onSuccess: (_data, { slug, materialSlugs }) => {
      toast.success(t('suppliers:materialDetached', { count: materialSlugs.length }))
      qc.invalidateQueries({ queryKey: supplierKeys.materials(slug) })
    },
  })
}

export function useSupplierTransactions(
  slug: string,
  params: ListParams<SupplierTransactionFilters>,
) {
  return useQuery({
    queryKey: [...supplierKeys.transactions(slug), params],
    queryFn: () => fetchSupplierTransactions(slug, params),
    placeholderData: keepPreviousData,
  })
}

export function useCreateSupplierTransaction() {
  const qc = useQueryClient()
  const { t } = useTranslation(['suppliers'])

  return useMutation<
    SupplierTransaction,
    ApiError,
    { slug: string; input: SupplierTransactionInput }
  >({
    mutationFn: ({ slug, input }) => createSupplierTransaction(slug, input),
    // Form giao dịch đưa lỗi backend (101220...) về đúng ô.
    meta: { suppressErrorToast: true },
    onSuccess: (_data, { slug }) => {
      toast.success(t('suppliers:transactionCreated'))
      qc.invalidateQueries({ queryKey: supplierKeys.transactions(slug) })
    },
  })
}
