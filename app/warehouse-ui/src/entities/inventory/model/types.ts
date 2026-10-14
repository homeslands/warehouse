/** `InventoryResponseDto` — một dòng tồn của vật tư trong một kho. Không có đơn vị gốc (backend chưa trả). */
export type InventoryItem = {
  slug: string
  createdAt: string
  updatedAt: string
  /** Tồn thật, theo đơn vị gốc. */
  quantity: number
  /** Đang giữ chỗ cho phiếu xuất chưa xong. */
  reservedQuantity: number
  availableQuantity: number
  /** Ngưỡng riêng của kho; `null` = dùng ngưỡng mặc định của vật tư. */
  minimumInventory: number | null
  maximumInventory: number | null
  effectiveMinimumInventory: number
  effectiveMaximumInventory: number
  isBelowMinimum: boolean
  isAboveMaximum: boolean
  warehouseSlug: string
  materialSlug: string
  materialCode: string
  materialName: string
  typeSlug: string
  typeName: string
}

/**
 * Phần `material` của `POST /warehouses/{w}/materials` (= `CreateMaterialRequestDto` tối thiểu). Khai lại ở đây vì
 * entity không import entity (`MaterialInput` của `entities/material` có cùng hình dạng).
 */
export type WarehouseMaterialInput = {
  code: string
  name: string
  typeSlug: string
  baseUnitSlug: string
}
