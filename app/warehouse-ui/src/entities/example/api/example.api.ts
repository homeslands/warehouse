import { deleteData, getPaginated, patchData, postData } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type { Example, ExampleFilters, ExampleInput, ExampleUpdateInput } from '../model/types'

// Tài nguyên định danh bằng `slug`, không phải `id`.
export const fetchExamples = (params: ListParams<ExampleFilters>): Promise<Paginated<Example>> =>
  getPaginated<Example>('/examples', params)

export const createExample = (input: ExampleInput): Promise<Example> =>
  postData<Example>('/examples', input)

export const updateExample = (slug: string, input: ExampleUpdateInput): Promise<Example> =>
  patchData<Example>(`/examples/${slug}`, input)

export const removeExample = (slug: string): Promise<string> =>
  deleteData<string>(`/examples/${slug}`)
