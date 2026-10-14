import { postData, putData } from '@/shared/api/http'
import type { InventoryItem, WarehouseMaterialInput } from '../model/types'

const base = (warehouseSlug: string) => `/warehouses/${warehouseSlug}/materials`

/** Gắn vật tư có sẵn vào kho. Không gửi tồn ban đầu / ngưỡng — tồn đi qua phiếu nhập. */
export const assignMaterialToWarehouse = (
  warehouseSlug: string,
  materialSlug: string,
): Promise<InventoryItem> => putData<InventoryItem>(base(warehouseSlug), { materialSlug })

/** Tạo vật tư mới + gắn vào kho trong một transaction. `quantity: 0` — tồn đi qua phiếu nhập, tránh cộng hai lần. */
export const createMaterialInWarehouse = (
  warehouseSlug: string,
  material: WarehouseMaterialInput,
): Promise<InventoryItem> => postData<InventoryItem>(base(warehouseSlug), { material, quantity: 0 })
