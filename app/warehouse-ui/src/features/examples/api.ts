import { deleteData, getPaginated, patchData, postData } from '@/shared/api/http'
import type { Paginated } from '@/shared/api/types'

export type Example = {
  id: string
  slug: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

export type ExampleInput = {
  name: string
  description?: string
}

// Tài nguyên định danh bằng `slug`, không phải `id`.
export const fetchExamples = (params: { page: number; size: number }): Promise<Paginated<Example>> =>
  getPaginated<Example>('/examples', params)

export const createExample = (input: ExampleInput): Promise<Example> =>
  postData<Example>('/examples', input)

export const updateExample = (slug: string, input: ExampleInput): Promise<Example> =>
  patchData<Example>(`/examples/${slug}`, input)

export const removeExample = (slug: string): Promise<string> => deleteData<string>(`/examples/${slug}`)
