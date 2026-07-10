import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ApiError } from '@/shared/api/types'
import { toastApiError } from '@/shared/lib/toast-error'
import {
  createExample,
  fetchExamples,
  removeExample,
  updateExample,
  type Example,
  type ExampleInput,
} from './api'

export const EXAMPLES_KEY = ['examples'] as const

export function useExamples(page: number, size: number) {
  return useQuery({
    queryKey: [...EXAMPLES_KEY, 'list', { page, size }],
    queryFn: () => fetchExamples({ page, size }),
  })
}

function useInvalidateExamples() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: EXAMPLES_KEY })
}

export function useCreateExample() {
  const invalidate = useInvalidateExamples()
  const { t } = useTranslation(['examples'])

  return useMutation<Example, ApiError, ExampleInput>({
    mutationFn: createExample,
    onSuccess: () => {
      toast.success(t('examples:created'))
      invalidate()
    },
    onError: toastApiError,
  })
}

export function useUpdateExample() {
  const invalidate = useInvalidateExamples()
  const { t } = useTranslation(['examples'])

  return useMutation<Example, ApiError, { slug: string; input: ExampleInput }>({
    mutationFn: ({ slug, input }) => updateExample(slug, input),
    onSuccess: () => {
      toast.success(t('examples:updated'))
      invalidate()
    },
    onError: toastApiError,
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
    onError: toastApiError,
  })
}
