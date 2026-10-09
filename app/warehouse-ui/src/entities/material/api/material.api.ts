import { getPaginated } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type { Material, MaterialFilters } from '../model/types'

export const fetchMaterials = (params: ListParams<MaterialFilters>): Promise<Paginated<Material>> =>
  getPaginated<Material>('/materials', params)
