import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ApiError, ListParams } from '@/shared/api/types'
import {
  cancelImportForm,
  confirmImportForm,
  createImportForm,
  fetchAvailableMaterials,
  fetchImportForm,
  fetchImportForms,
  removeImportForm,
  updateImportForm,
} from './import-form.api'
import { importFormKeys } from './query-keys'
import type {
  ImportForm,
  ImportFormFilters,
  ImportFormInput,
  ImportFormUpdateInput,
} from '../model/types'

/** `warehouseSlug` rỗng = chưa chọn kho → không gọi. */
export function useImportForms(warehouseSlug: string, params: ListParams<ImportFormFilters>) {
  return useQuery({
    queryKey: importFormKeys.list(warehouseSlug, params),
    queryFn: () => fetchImportForms(warehouseSlug, params),
    enabled: warehouseSlug !== '',
    placeholderData: keepPreviousData,
  })
}

/** Chi tiết — trang tự báo 404 / lỗi tại chỗ. */
export function useImportForm(
  warehouseSlug: string,
  slug: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: importFormKeys.detail(warehouseSlug, slug),
    queryFn: () => fetchImportForm(warehouseSlug, slug),
    enabled: warehouseSlug !== '' && slug !== '' && (options.enabled ?? true),
    meta: { suppressErrorToast: true },
  })
}

/** Vật tư cho ô chọn của form phiếu: trang 1, `size: 100`, lọc tại client. */
export function useAvailableMaterials(warehouseSlug: string, options: { enabled?: boolean } = {}) {
  const params = { page: 1, size: 100 }
  return useQuery({
    queryKey: [...importFormKeys.available(warehouseSlug), params],
    queryFn: () => fetchAvailableMaterials(warehouseSlug, params),
    enabled: warehouseSlug !== '' && (options.enabled ?? true),
  })
}

export function useCreateImportForm() {
  const qc = useQueryClient()
  const { t } = useTranslation(['importForms'])
  return useMutation<ImportForm, ApiError, { warehouseSlug: string; input: ImportFormInput }>({
    mutationFn: ({ warehouseSlug, input }) => createImportForm(warehouseSlug, input),
    // Form tự báo lỗi tại ô.
    meta: { suppressErrorToast: true },
    onSuccess: (form) => {
      toast.success(t('importForms:created'))
      void qc.invalidateQueries({ queryKey: importFormKeys.lists(form.warehouseSlug) })
    },
  })
}

export function useUpdateImportForm() {
  const qc = useQueryClient()
  const { t } = useTranslation(['importForms'])
  return useMutation<
    ImportForm,
    ApiError,
    { warehouseSlug: string; slug: string; input: ImportFormUpdateInput }
  >({
    mutationFn: ({ warehouseSlug, slug, input }) => updateImportForm(warehouseSlug, slug, input),
    meta: { suppressErrorToast: true },
    onSuccess: (form, { warehouseSlug, slug }) => {
      toast.success(t('importForms:updated'))
      qc.setQueryData(importFormKeys.detail(warehouseSlug, slug), form)
      void qc.invalidateQueries({ queryKey: importFormKeys.lists(warehouseSlug) })
    },
  })
}

export function useDeleteImportForm() {
  const qc = useQueryClient()
  const { t } = useTranslation(['importForms'])
  return useMutation<string, ApiError, { warehouseSlug: string; slug: string }>({
    mutationFn: ({ warehouseSlug, slug }) => removeImportForm(warehouseSlug, slug),
    // Hộp xoá tự xử lý 409 / 403.
    meta: { suppressErrorToast: true },
    onSuccess: (_, { warehouseSlug }) => {
      toast.success(t('importForms:deleted'))
      // Chỉ danh sách: invalidate cả kho sẽ tải lại chi tiết của phiếu vừa xoá → 404.
      void qc.invalidateQueries({ queryKey: importFormKeys.lists(warehouseSlug) })
    },
  })
}

type StatusChange = { warehouseSlug: string; slug: string; version: number }

function useStatusChange(
  fn: (warehouseSlug: string, slug: string, version: number) => Promise<ImportForm>,
  successKey: 'importForms:confirmed' | 'importForms:cancelled',
) {
  const qc = useQueryClient()
  const { t } = useTranslation(['importForms'])
  return useMutation<ImportForm, ApiError, StatusChange>({
    mutationFn: ({ warehouseSlug, slug, version }) => fn(warehouseSlug, slug, version),
    meta: { suppressErrorToast: true },
    onSuccess: (form, { warehouseSlug, slug }) => {
      toast.success(t(successKey))
      qc.setQueryData(importFormKeys.detail(warehouseSlug, slug), form)
      // Danh sách + vật tư khả dụng (tồn vừa đổi khi xác nhận).
      void qc.invalidateQueries({ queryKey: importFormKeys.lists(warehouseSlug) })
      void qc.invalidateQueries({ queryKey: importFormKeys.available(warehouseSlug) })
    },
  })
}

export function useConfirmImportForm() {
  return useStatusChange(confirmImportForm, 'importForms:confirmed')
}

export function useCancelImportForm() {
  return useStatusChange(cancelImportForm, 'importForms:cancelled')
}
