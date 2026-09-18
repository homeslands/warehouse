import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { isVersionConflict } from '@/shared/api/http'
import type { ApiError, ListParams } from '@/shared/api/types'
import { createExample, fetchExamples, removeExample, updateExample } from './example.api'
import { exampleKeys } from './query-keys'
import type { Example, ExampleFilters, ExampleInput, ExampleUpdateInput } from '../model/types'

export function useExamples(params: ListParams<ExampleFilters>) {
  return useQuery({
    queryKey: exampleKeys.list(params),
    queryFn: () => fetchExamples(params),
    // Chuyển trang vẫn hiện trang cũ tới khi trang mới về, thay vì nháy về "Đang tải...".
    placeholderData: keepPreviousData,
  })
}

function useInvalidateExamples() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: exampleKeys.all })
}

export function useCreateExample() {
  const invalidate = useInvalidateExamples()
  const { t } = useTranslation(['examples'])

  return useMutation<Example, ApiError, ExampleInput>({
    mutationFn: createExample,
    // Form tự báo lỗi: lỗi thuộc ô (tên trùng) hiện dưới ô, còn lại tự toastApiError.
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('examples:created'))
      invalidate()
    },
  })
}

export function useUpdateExample() {
  const invalidate = useInvalidateExamples()
  const { t } = useTranslation(['examples'])

  return useMutation<Example, ApiError, { slug: string; input: ExampleUpdateInput }>({
    mutationFn: ({ slug, input }) => updateExample(slug, input),
    // Như useCreateExample: form tự báo lỗi (kể cả xung đột version).
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('examples:updated'))
      invalidate()
    },
    onError: (error) => {
      // Version trong cache đã cũ: tải lại để lần sửa sau dùng version mới. Form tự toast.
      if (isVersionConflict(error)) invalidate()
    },
  })
}

export function useDeleteExample() {
  const invalidate = useInvalidateExamples()
  const { t } = useTranslation(['examples'])

  return useMutation<string, ApiError, string>({
    mutationFn: removeExample,
    onSuccess: () => {
      toast.success(t('examples:deleted'))
      invalidate()
    },
  })
}
