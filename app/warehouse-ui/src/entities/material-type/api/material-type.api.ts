import { deleteData, getPaginated, patchData, postData } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type {
  MaterialType,
  MaterialTypeFilters,
  MaterialTypeInput,
  MaterialTypeUpdateInput,
} from '../model/types'

export const fetchMaterialTypes = (
  params: ListParams<MaterialTypeFilters>,
): Promise<Paginated<MaterialType>> => getPaginated<MaterialType>('/material-types', params)

export const createMaterialType = (input: MaterialTypeInput): Promise<MaterialType> =>
  postData<MaterialType>('/material-types', input)

export const updateMaterialType = (
  slug: string,
  input: MaterialTypeUpdateInput,
): Promise<MaterialType> => patchData<MaterialType>(`/material-types/${slug}`, input)

/** Xoá mềm; backend chặn khi còn vật tư thuộc loại (100609). */
export const removeMaterialType = (slug: string): Promise<string> =>
  deleteData<string>(`/material-types/${slug}`)
