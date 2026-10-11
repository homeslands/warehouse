import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ApiError, ListParams } from '@/shared/api/types'
import {
  createMaterialType,
  fetchMaterialTypes,
  removeMaterialType,
  updateMaterialType,
} from './material-type.api'
import { materialTypeKeys } from './query-keys'
import type {
  MaterialType,
  MaterialTypeFilters,
  MaterialTypeInput,
  MaterialTypeUpdateInput,
} from '../model/types'

export function useMaterialTypes(params: ListParams<MaterialTypeFilters>) {
  return useQuery({
    queryKey: materialTypeKeys.list(params),
    queryFn: () => fetchMaterialTypes(params),
    placeholderData: keepPreviousData,
  })
}

/** Loại vật tư cho ô chọn / bộ lọc: trang 1, `size: 100`, lọc tại client. */
export function useMaterialTypeOptions(options: { enabled?: boolean } = {}) {
  const params = { page: 1, size: 100 }
  return useQuery({
    queryKey: materialTypeKeys.list(params),
    queryFn: () => fetchMaterialTypes(params),
    enabled: options.enabled ?? true,
  })
}

function useInvalidateMaterialTypes() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: materialTypeKeys.all })
}

export function useCreateMaterialType() {
  const invalidate = useInvalidateMaterialTypes()
  const { t } = useTranslation(['materialTypes'])
  return useMutation<MaterialType, ApiError, MaterialTypeInput>({
    mutationFn: createMaterialType,
    // Form tự báo lỗi tại ô.
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('materialTypes:created'))
      void invalidate()
    },
  })
}

export function useUpdateMaterialType() {
  const invalidate = useInvalidateMaterialTypes()
  const { t } = useTranslation(['materialTypes'])
  return useMutation<MaterialType, ApiError, { slug: string; input: MaterialTypeUpdateInput }>({
    mutationFn: ({ slug, input }) => updateMaterialType(slug, input),
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('materialTypes:updated'))
      void invalidate()
    },
  })
}

export function useDeleteMaterialType() {
  const invalidate = useInvalidateMaterialTypes()
  const { t } = useTranslation(['materialTypes'])
  return useMutation<string, ApiError, string>({
    mutationFn: removeMaterialType,
    // Hộp xoá tự báo 100609 (còn vật tư thuộc loại) tại chỗ.
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('materialTypes:deleted'))
      void invalidate()
    },
  })
}
