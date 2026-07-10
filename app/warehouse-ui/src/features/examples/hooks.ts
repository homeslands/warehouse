import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ApiError } from '@/shared/api/types'
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

  return useMutation<Example, ApiError, ExampleInput>({
    mutationFn: createExample,
    onSuccess: () => {
      toast.success('Đã tạo example')
      invalidate()
    },
    onError: (error) => toast.error(error.message),
  })
}

export function useUpdateExample() {
  const invalidate = useInvalidateExamples()

  return useMutation<Example, ApiError, { slug: string; input: ExampleInput }>({
    mutationFn: ({ slug, input }) => updateExample(slug, input),
    onSuccess: () => {
      toast.success('Đã cập nhật example')
      invalidate()
    },
    onError: (error) => toast.error(error.message),
  })
}

export function useDeleteExample() {
  const invalidate = useInvalidateExamples()

  return useMutation<string, ApiError, string>({
    mutationFn: removeExample,
    onSuccess: () => {
      toast.success('Đã xoá example')
      invalidate()
    },
    onError: (error) => toast.error(error.message),
  })
}
