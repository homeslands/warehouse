import { deleteData, getPaginated, patchData, postData } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type { Unit, UnitFilters, UnitInput, UnitRecord, UnitUpdateInput } from '../model/types'

export const fetchUnits = (params: ListParams<UnitFilters>): Promise<Paginated<Unit>> =>
  getPaginated<Unit>('/units', params)

export const createUnit = (input: UnitInput): Promise<UnitRecord> =>
  postData<UnitRecord>('/units', input)

export const updateUnit = (slug: string, input: UnitUpdateInput): Promise<UnitRecord> =>
  patchData<UnitRecord>(`/units/${slug}`, input)

/** Xoá mềm; backend chặn khi còn vật tư dùng (100909). Trả câu thông báo. */
export const removeUnit = (slug: string): Promise<string> => deleteData<string>(`/units/${slug}`)
