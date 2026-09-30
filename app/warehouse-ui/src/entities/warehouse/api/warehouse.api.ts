import { deleteData, getData, getPaginated, patchData, postData, putData } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type {
  AssignWarehouseManagerInput,
  Warehouse,
  WarehouseFilters,
  WarehouseInput,
  WarehouseUpdateInput,
} from '../model/types'

// Tài nguyên định danh bằng `slug`, không phải `id`.
export const fetchWarehouses = (
  params: ListParams<WarehouseFilters>,
): Promise<Paginated<Warehouse>> => getPaginated<Warehouse>('/warehouses', params)

export const createWarehouse = (input: WarehouseInput): Promise<Warehouse> =>
  postData<Warehouse>('/warehouses', input)

export const updateWarehouse = (slug: string, input: WarehouseUpdateInput): Promise<Warehouse> =>
  patchData<Warehouse>(`/warehouses/${slug}`, input)

export const removeWarehouse = (slug: string): Promise<string> =>
  deleteData<string>(`/warehouses/${slug}`)

/**
 * Tách khỏi PATCH vì backend tách: `PUT /warehouses/:slug/manager` thay đúng một slot và idempotent.
 * Gộp vào form sửa sẽ thành hai request cho một lần bấm Lưu, lỗi nửa chừng không xử lý gọn được.
 */
export const assignWarehouseManager = (
  slug: string,
  input: AssignWarehouseManagerInput,
): Promise<Warehouse> => putData<Warehouse>(`/warehouses/${slug}/manager`, input)

export const fetchWarehouse = (slug: string): Promise<Warehouse> =>
  getData<Warehouse>(`/warehouses/${slug}`)
