import { deleteData, getData, getPaginated, patchData, postData, putData } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type {
  AssignStoreWarehouseInput,
  Store,
  StoreFilters,
  StoreInput,
  StoreUpdateInput,
} from '../model/types'

export const fetchStores = (params: ListParams<StoreFilters>): Promise<Paginated<Store>> =>
  getPaginated<Store>('/stores', params)

export const createStore = (input: StoreInput): Promise<Store> => postData<Store>('/stores', input)

export const updateStore = (slug: string, input: StoreUpdateInput): Promise<Store> =>
  patchData<Store>(`/stores/${slug}`, input)

/** Như `DELETE /warehouses/:slug`: backend trả câu thông báo ("1 store have been deleted..."). */
export const removeStore = (slug: string): Promise<string> => deleteData<string>(`/stores/${slug}`)

/** Như `PUT /warehouses/:slug/manager`: thay đúng một slot, idempotent, tách khỏi PATCH. */
export const assignStoreWarehouse = (
  slug: string,
  input: AssignStoreWarehouseInput,
): Promise<Store> => putData<Store>(`/stores/${slug}/warehouse`, input)

export const fetchStore = (slug: string): Promise<Store> => getData<Store>(`/stores/${slug}`)
