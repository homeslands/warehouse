import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ApiError, ListParams } from '@/shared/api/types'
import {
  cancelExportForm,
  confirmExportForm,
  createExportForm,
  fetchExportForm,
  fetchExportForms,
  removeExportForm,
  submitExportForm,
  updateExportForm,
} from './export-form.api'
import { exportFormKeys } from './query-keys'
import type {
  ExportForm,
  ExportFormFilters,
  ExportFormInput,
  ExportFormUpdateInput,
} from '../model/types'

/** `warehouseSlug` rỗng = chưa chọn kho → không gọi. */
export function useExportForms(
  warehouseSlug: string,
  params: ListParams<ExportFormFilters>,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: exportFormKeys.list(warehouseSlug, params),
    queryFn: () => fetchExportForms(warehouseSlug, params),
    enabled: warehouseSlug !== '' && (options.enabled ?? true),
    placeholderData: keepPreviousData,
  })
}

/** Chi tiết — trang tự báo 404 / lỗi tại chỗ. */
export function useExportForm(
  warehouseSlug: string,
  slug: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: exportFormKeys.detail(warehouseSlug, slug),
    queryFn: () => fetchExportForm(warehouseSlug, slug),
    enabled: warehouseSlug !== '' && slug !== '' && (options.enabled ?? true),
    meta: { suppressErrorToast: true },
  })
}

/** Số phiếu `PENDING` của kho (cho huy hiệu chờ duyệt): chỉ lấy `total` của trang 1, `size: 1`. */
export function usePendingExportFormCount(
  warehouseSlug: string,
  options: { enabled?: boolean } = {},
): number | undefined {
  const params: ListParams<ExportFormFilters> = { status: 'PENDING', page: 1, size: 1 }
  const query = useQuery({
    queryKey: exportFormKeys.list(warehouseSlug, params),
    queryFn: () => fetchExportForms(warehouseSlug, params),
    enabled: warehouseSlug !== '' && (options.enabled ?? true),
    select: (page) => page.total,
    // Huy hiệu phụ: lỗi không đáng một toast.
    meta: { suppressErrorToast: true },
  })
  return query.data
}

/** `successToast: false` = nơi gọi tự báo thành công (vd. luồng "Lưu & gửi duyệt" có thông báo riêng). */
type MutationOptions = { successToast?: boolean }

export function useCreateExportForm({ successToast = true }: MutationOptions = {}) {
  const qc = useQueryClient()
  const { t } = useTranslation(['exportForms'])
  return useMutation<ExportForm, ApiError, { warehouseSlug: string; input: ExportFormInput }>({
    mutationFn: ({ warehouseSlug, input }) => createExportForm(warehouseSlug, input),
    // Form tự báo lỗi tại ô.
    meta: { suppressErrorToast: true },
    onSuccess: (form, { warehouseSlug }) => {
      if (successToast) toast.success(t('exportForms:toastDraftSaved', { code: form.code }))
      void qc.invalidateQueries({ queryKey: exportFormKeys.warehouse(warehouseSlug) })
    },
  })
}

export function useUpdateExportForm({ successToast = true }: MutationOptions = {}) {
  const qc = useQueryClient()
  const { t } = useTranslation(['exportForms'])
  return useMutation<
    ExportForm,
    ApiError,
    { warehouseSlug: string; slug: string; input: ExportFormUpdateInput }
  >({
    mutationFn: ({ warehouseSlug, slug, input }) => updateExportForm(warehouseSlug, slug, input),
    meta: { suppressErrorToast: true },
    onSuccess: (form, { warehouseSlug }) => {
      if (successToast) toast.success(t('exportForms:toastDraftSaved', { code: form.code }))
      void qc.invalidateQueries({ queryKey: exportFormKeys.warehouse(warehouseSlug) })
    },
  })
}

export function useDeleteExportForm() {
  const qc = useQueryClient()
  const { t } = useTranslation(['exportForms'])
  return useMutation<string, ApiError, { warehouseSlug: string; slug: string }>({
    mutationFn: ({ warehouseSlug, slug }) => removeExportForm(warehouseSlug, slug),
    // Hộp xoá tự xử lý 409 / 403.
    meta: { suppressErrorToast: true },
    onSuccess: (_, { warehouseSlug, slug }) => {
      toast.success(t('exportForms:toastDeleted'))
      // Phiếu vừa xoá: bỏ chi tiết khỏi cache thay vì tải lại (sẽ 404), rồi làm mới phần còn lại.
      qc.removeQueries({ queryKey: exportFormKeys.detail(warehouseSlug, slug) })
      void qc.invalidateQueries({ queryKey: exportFormKeys.lists(warehouseSlug) })
    },
  })
}

type StatusChange = { warehouseSlug: string; slug: string; version: number }

type ToastKey =
  'exportForms:toastSubmitted' | 'exportForms:toastExported' | 'exportForms:toastCancelled'

function useStatusChange(
  fn: (warehouseSlug: string, slug: string, version: number) => Promise<ExportForm>,
  toastKey: ToastKey,
  successToast: boolean,
) {
  const qc = useQueryClient()
  const { t } = useTranslation(['exportForms'])
  return useMutation<ExportForm, ApiError, StatusChange>({
    mutationFn: ({ warehouseSlug, slug, version }) => fn(warehouseSlug, slug, version),
    meta: { suppressErrorToast: true },
    onSuccess: (form, { warehouseSlug }) => {
      if (successToast) toast.success(t(toastKey, { code: form.code }))
      // Tồn kho / lô là entity khác — tầng feature tự invalidate.
      void qc.invalidateQueries({ queryKey: exportFormKeys.warehouse(warehouseSlug) })
    },
  })
}

export function useSubmitExportForm({ successToast = true }: MutationOptions = {}) {
  return useStatusChange(submitExportForm, 'exportForms:toastSubmitted', successToast)
}

export function useConfirmExportForm({ successToast = true }: MutationOptions = {}) {
  return useStatusChange(confirmExportForm, 'exportForms:toastExported', successToast)
}

export function useCancelExportForm({ successToast = true }: MutationOptions = {}) {
  return useStatusChange(cancelExportForm, 'exportForms:toastCancelled', successToast)
}
