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
  /**
   * Đơn vị gốc — BE đang bổ sung (tên theo đề xuất gửi BE). Chưa có thì FE chỉ hiện số. BE đặt tên khác → sửa ở đây.
   */
  baseUnitSlug?: string
  baseUnitCode?: string
  baseUnitName?: string
}

/**
 * Lọc `GET /warehouses/{w}/materials`. `typeSlug`, `belowMinimum`, `aboveMaximum` chạy thật (2026-10-15); `name`/`code`
 * BE đang làm — chỉ gửi khi `BACKEND_SUPPORTS.inventorySearch` bật. Boolean chỉ gửi khi `true` (để `undefined` khi tắt).
 */
export type InventoryFilters = {
  typeSlug?: string
  belowMinimum?: boolean
  aboveMaximum?: boolean
  name?: string
  code?: string
}

export type InventoryAction = 'ASSIGN' | 'ADJUST' | 'IMPORT' | 'RESERVE' | 'RELEASE' | 'REMOVE'

/** `InventoryHistoryResponseDto`. `action` khai `string` để mã mới của BE không làm vỡ kiểu — FE hiện nguyên mã. */
export type InventoryHistory = {
  slug: string
  createdAt: string
  updatedAt: string
  action: string
  quantityDelta: number
  quantityBefore: number
  quantityAfter: number
  reservedDelta: number
  reservedBefore: number
  reservedAfter: number
  /** Phiếu nhập ghi dạng `"Import form P500D03"`. */
  note: string | null
  changedBySlug: string | null
  /** Có thể `""` (người thao tác chưa có họ tên). */
  changedByName: string
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
