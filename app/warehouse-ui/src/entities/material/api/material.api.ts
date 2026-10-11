import { deleteData, getData, getPaginated, patchData, postData } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type {
  ConversionCandidate,
  Material,
  MaterialConversionUnit,
  MaterialFilters,
  MaterialInput,
  MaterialUpdateInput,
} from '../model/types'

export const fetchMaterials = (params: ListParams<MaterialFilters>): Promise<Paginated<Material>> =>
  getPaginated<Material>('/materials', params)

export const fetchMaterial = (slug: string): Promise<Material> =>
  getData<Material>(`/materials/${slug}`)

export const createMaterial = (input: MaterialInput): Promise<Material> =>
  postData<Material>('/materials', input)

export const updateMaterial = (slug: string, input: MaterialUpdateInput): Promise<Material> =>
  patchData<Material>(`/materials/${slug}`, input)

/** Xoá mềm; backend chặn khi còn gán vào kho (100712). */
export const removeMaterial = (slug: string): Promise<string> =>
  deleteData<string>(`/materials/${slug}`)

export const fetchConversionUnits = (
  slug: string,
  params: ListParams,
): Promise<Paginated<MaterialConversionUnit>> =>
  getPaginated<MaterialConversionUnit>(`/materials/${slug}/conversion-units`, params)

export const fetchAvailableUnits = (
  slug: string,
  params: ListParams,
): Promise<Paginated<ConversionCandidate>> =>
  getPaginated<ConversionCandidate>(`/materials/${slug}/conversion-units/available`, params)

export const attachConversionUnit = (
  slug: string,
  input: { unitSlug: string; conversionRate: number },
): Promise<MaterialConversionUnit> =>
  postData<MaterialConversionUnit>(`/materials/${slug}/conversion-units`, input)

export const updateConversionUnit = (
  slug: string,
  unitSlug: string,
  input: { conversionRate: number },
): Promise<MaterialConversionUnit> =>
  patchData<MaterialConversionUnit>(`/materials/${slug}/conversion-units/${unitSlug}`, input)

/** Không gỡ được dòng đơn vị gốc (100722). */
export const detachConversionUnit = (slug: string, unitSlug: string): Promise<string> =>
  deleteData<string>(`/materials/${slug}/conversion-units/${unitSlug}`)
