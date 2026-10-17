import { deleteData, getPaginated, postData, putData } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type {
  InventoryFilters,
  InventoryHistory,
  InventoryItem,
  WarehouseMaterialInput,
} from '../model/types'

const base = (warehouseSlug: string) => `/warehouses/${warehouseSlug}/materials`

/** Gắn vật tư có sẵn vào kho. Không gửi tồn ban đầu / ngưỡng — tồn đi qua phiếu nhập. */
export const assignMaterialToWarehouse = (
  warehouseSlug: string,
  materialSlug: string,
): Promise<InventoryItem> => putData<InventoryItem>(base(warehouseSlug), { materialSlug })

/**
 * Tạo vật tư mới + gắn vào kho (+ gắn NCC nếu có `supplierSlug`) trong một transaction. `quantity: 0` — tồn đi qua
 * phiếu nhập, tránh cộng hai lần.
 */
export const createMaterialInWarehouse = (
  warehouseSlug: string,
  material: WarehouseMaterialInput,
  supplierSlug?: string,
): Promise<InventoryItem> =>
  postData<InventoryItem>(base(warehouseSlug), {
    material,
    quantity: 0,
    ...(supplierSlug ? { supplierSlug } : {}),
  })

export const fetchWarehouseInventory = (
  warehouseSlug: string,
  params: ListParams<InventoryFilters>,
): Promise<Paginated<InventoryItem>> => getPaginated<InventoryItem>(base(warehouseSlug), params)

export const fetchInventoryHistory = (
  warehouseSlug: string,
  materialSlug: string,
  params: ListParams,
): Promise<Paginated<InventoryHistory>> =>
  getPaginated<InventoryHistory>(`${base(warehouseSlug)}/${materialSlug}/histories`, params)

/** Chặn khi tồn > 0 (100807) / giữ chỗ > 0 (100813); 100801 khi đã không còn ở kho. */
export const removeWarehouseMaterial = (warehouseSlug: string, materialSlug: string) =>
  deleteData<unknown>(`${base(warehouseSlug)}/${materialSlug}`)
