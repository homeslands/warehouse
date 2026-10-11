import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ApiError, ListParams } from '@/shared/api/types'
import { createUnit, fetchUnits, removeUnit, updateUnit } from './unit.api'
import { unitKeys } from './query-keys'
import type { UnitFilters, UnitInput, UnitRecord, UnitUpdateInput } from '../model/types'

export function useUnits(params: ListParams<UnitFilters>) {
  return useQuery({
    queryKey: unitKeys.list(params),
    queryFn: () => fetchUnits(params),
    placeholderData: keepPreviousData,
  })
}

/** Danh sách đơn vị cho ô chọn: trang 1, `size: 100`, lọc tại client; `enabled` để chỉ tải khi mở form / hộp. */
export function useUnitOptions(options: { enabled?: boolean } = {}) {
  const params = { page: 1, size: 100 }
  return useQuery({
    queryKey: unitKeys.list(params),
    queryFn: () => fetchUnits(params),
    enabled: options.enabled ?? true,
  })
}

function useInvalidateUnits() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: unitKeys.all })
}

export function useCreateUnit() {
  const invalidate = useInvalidateUnits()
  const { t } = useTranslation(['units'])
  return useMutation<UnitRecord, ApiError, UnitInput>({
    mutationFn: createUnit,
    // Form tự báo lỗi tại ô (mã trùng, định dạng sai...).
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('units:created'))
      void invalidate()
    },
  })
}

export function useUpdateUnit() {
  const invalidate = useInvalidateUnits()
  const { t } = useTranslation(['units'])
  return useMutation<UnitRecord, ApiError, { slug: string; input: UnitUpdateInput }>({
    mutationFn: ({ slug, input }) => updateUnit(slug, input),
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('units:updated'))
      void invalidate()
    },
  })
}

export function useDeleteUnit() {
  const invalidate = useInvalidateUnits()
  const { t } = useTranslation(['units'])
  return useMutation<string, ApiError, string>({
    mutationFn: removeUnit,
    // Hộp xoá tự báo 100909 (còn vật tư dùng) tại chỗ.
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('units:deleted'))
      void invalidate()
    },
  })
}
