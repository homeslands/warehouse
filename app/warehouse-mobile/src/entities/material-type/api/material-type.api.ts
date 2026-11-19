import { fetchAllPages } from '@/shared/api/fetch-all-pages'
import { deleteData, getData, patchData, postData } from '@/shared/api/http'
import type { MaterialType, MaterialTypeInput, MaterialTypeUpdateInput } from '../model/types'

export const fetchAllMaterialTypes = (): Promise<MaterialType[]> =>
  fetchAllPages<MaterialType>('/material-types', { sort: 'DESC' })

export const fetchMaterialType = (slug: string): Promise<MaterialType> =>
  getData<MaterialType>(`/material-types/${slug}`)

export const createMaterialType = (input: MaterialTypeInput): Promise<MaterialType> =>
  postData<MaterialType>('/material-types', input)

export const updateMaterialType = (
  slug: string,
  input: MaterialTypeUpdateInput,
): Promise<MaterialType> => patchData<MaterialType>(`/material-types/${slug}`, input)

export const deleteMaterialType = (slug: string): Promise<void> =>
  deleteData<void>(`/material-types/${slug}`)
