import { fetchAllPages } from '@/shared/api/fetch-all-pages'
import { deleteData, getData, patchData, postData } from '@/shared/api/http'
import type { Unit, UnitInput, UnitUpdateInput } from '../model/types'

export const fetchAllUnits = (): Promise<Unit[]> => fetchAllPages<Unit>('/units', { sort: 'DESC' })

export const fetchUnit = (slug: string): Promise<Unit> => getData<Unit>(`/units/${slug}`)

export const createUnit = (input: UnitInput): Promise<Unit> => postData<Unit>('/units', input)

export const updateUnit = (slug: string, input: UnitUpdateInput): Promise<Unit> =>
  patchData<Unit>(`/units/${slug}`, input)

export const deleteUnit = (slug: string): Promise<void> => deleteData<void>(`/units/${slug}`)
