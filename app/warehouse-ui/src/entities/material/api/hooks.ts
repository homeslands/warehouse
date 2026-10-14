import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ApiError, ListParams } from '@/shared/api/types'
import {
  attachConversionUnit,
  createMaterial,
  detachConversionUnit,
  fetchAvailableUnits,
  fetchConversionUnits,
  fetchMaterial,
  fetchMaterials,
  removeMaterial,
  updateConversionUnit,
  updateMaterial,
} from './material.api'
import { materialKeys } from './query-keys'
import type {
  Material,
  MaterialConversionUnit,
  MaterialFilters,
  MaterialInput,
  MaterialUpdateInput,
} from '../model/types'

export function useMaterials(params: ListParams<MaterialFilters>, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: materialKeys.list(params),
    queryFn: () => fetchMaterials(params),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  })
}

/**
 * Danh sách vật tư cho ô chọn: trang 1, `size: 100`; `enabled` để chỉ tải khi mở hộp thoại; `hasSupplier: false` =
 * chỉ vật tư chưa thuộc nhà cung cấp nào (hộp gắn vật tư vào NCC).
 */
export function useMaterialOptions(options: { enabled?: boolean; hasSupplier?: boolean } = {}) {
  const params: ListParams<MaterialFilters> = {
    page: 1,
    size: 100,
    hasSupplier: options.hasSupplier,
  }
  return useQuery({
    queryKey: materialKeys.list(params),
    queryFn: () => fetchMaterials(params),
    enabled: options.enabled ?? true,
  })
}

/** Chi tiết một vật tư — trang tự báo lỗi tại chỗ. */
export function useMaterial(slug: string) {
  return useQuery({
    queryKey: materialKeys.detail(slug),
    queryFn: () => fetchMaterial(slug),
    meta: { suppressErrorToast: true },
  })
}

export function useCreateMaterial() {
  const qc = useQueryClient()
  const { t } = useTranslation(['materials'])
  return useMutation<Material, ApiError, MaterialInput>({
    mutationFn: createMaterial,
    // Form tự báo lỗi tại ô.
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('materials:created'))
      void qc.invalidateQueries({ queryKey: materialKeys.all })
    },
  })
}

export function useUpdateMaterial() {
  const qc = useQueryClient()
  const { t } = useTranslation(['materials'])
  return useMutation<Material, ApiError, { slug: string; input: MaterialUpdateInput }>({
    mutationFn: ({ slug, input }) => updateMaterial(slug, input),
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('materials:updated'))
      void qc.invalidateQueries({ queryKey: materialKeys.all })
    },
  })
}

export function useDeleteMaterial() {
  const qc = useQueryClient()
  const { t } = useTranslation(['materials'])
  return useMutation<string, ApiError, string>({
    mutationFn: removeMaterial,
    // Hộp xoá tự báo 100712 (còn gán vào kho) tại chỗ.
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('materials:deleted'))
      // Chỉ danh sách: invalidate `all` sẽ tải lại detail / quy đổi của bản ghi vừa xoá (trang chi tiết còn
      // observer) → 404 + toast. Trang chi tiết tự gỡ cache của slug khi unmount.
      void qc.invalidateQueries({ queryKey: materialKeys.lists() })
    },
  })
}

export function useConversionUnits(
  slug: string,
  params: ListParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: materialKeys.conversionList(slug, params),
    queryFn: () => fetchConversionUnits(slug, params),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  })
}

/** Đơn vị gắn được (trang 1, `size: 100`) cho ô chọn của hộp quy đổi. */
export function useAvailableUnits(slug: string, options: { enabled?: boolean } = {}) {
  const params = { page: 1, size: 100 }
  return useQuery({
    queryKey: [...materialKeys.availableUnits(slug), params],
    queryFn: () => fetchAvailableUnits(slug, params),
    enabled: options.enabled ?? true,
  })
}

type ConversionVars = { slug: string; unitSlug: string; conversionRate: number }

export function useAttachConversionUnit() {
  const qc = useQueryClient()
  const { t } = useTranslation(['materials'])
  return useMutation<MaterialConversionUnit, ApiError, ConversionVars>({
    mutationFn: ({ slug, unitSlug, conversionRate }) =>
      attachConversionUnit(slug, { unitSlug, conversionRate }),
    // Hộp quy đổi hiện lỗi tại ô.
    meta: { suppressErrorToast: true },
    onSuccess: () => toast.success(t('materials:conversionAttached')),
    // Cả khi lỗi: 100716 / 100717 / 100901 nghĩa là bảng hoặc danh sách gắn được đã cũ (người khác vừa đổi).
    onSettled: (_data, _error, { slug }) =>
      qc.invalidateQueries({ queryKey: materialKeys.conversions(slug) }),
  })
}

export function useUpdateConversionUnit() {
  const qc = useQueryClient()
  const { t } = useTranslation(['materials'])
  return useMutation<MaterialConversionUnit, ApiError, ConversionVars>({
    mutationFn: ({ slug, unitSlug, conversionRate }) =>
      updateConversionUnit(slug, unitSlug, { conversionRate }),
    meta: { suppressErrorToast: true },
    onSuccess: () => toast.success(t('materials:conversionUpdated')),
    // Cả khi lỗi: 100716 / 100717 / 100901 nghĩa là bảng hoặc danh sách gắn được đã cũ (người khác vừa đổi).
    onSettled: (_data, _error, { slug }) =>
      qc.invalidateQueries({ queryKey: materialKeys.conversions(slug) }),
  })
}

export function useDetachConversionUnit() {
  const qc = useQueryClient()
  const { t } = useTranslation(['materials'])
  return useMutation<string, ApiError, { slug: string; unitSlug: string }>({
    mutationFn: ({ slug, unitSlug }) => detachConversionUnit(slug, unitSlug),
    onSuccess: () => toast.success(t('materials:conversionDetached')),
    // Cả khi lỗi: 100716 / 100717 / 100901 nghĩa là bảng hoặc danh sách gắn được đã cũ (người khác vừa đổi).
    onSettled: (_data, _error, { slug }) =>
      qc.invalidateQueries({ queryKey: materialKeys.conversions(slug) }),
  })
}
