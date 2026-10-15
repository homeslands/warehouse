/** Phần FE dùng của object lồng trong `MaterialResponseDto` (loại / đơn vị / nhà cung cấp) — backend trả đủ DTO của module đó. */
export type MaterialRef = {
  slug: string
  code: string
  name: string
}

/**
 * `MaterialResponseDto`. Danh mục không có `version`, không có `isActive`, không có `description`. Tên vật tư ĐƯỢC
 * trùng (backend không có mã lỗi trùng tên).
 *
 * Từ WMS-13-be(9) (2026-10-12) loại / đơn vị gốc là **object lồng** (`type`, `baseUnit`), không còn trường phẳng
 * `typeSlug`/`baseUnitCode`…; body gửi lên và bộ lọc vẫn dùng `typeSlug` / `baseUnitSlug`. `baseUnit: null` = dữ liệu cũ
 * chưa có đơn vị gốc (100714). Một vật tư thuộc được NHIỀU nhà cung cấp (`suppliers`, rỗng khi chưa gắn — BE đổi từ
 * `supplier` đơn lẻ, 2026-10-15); FE chỉ khai các trường đang dùng của mỗi NCC.
 * `GET /suppliers/{slug}/materials` vẫn trả dạng phẳng — xem `SupplierMaterial`.
 */
export type Material = {
  slug: string
  createdAt: string
  updatedAt: string
  code: string
  name: string
  /** Ngưỡng mặc định; kho có thể ghi đè. ≥ 0, tối đa 6 số lẻ. */
  minimumInventory: number
  maximumInventory: number
  type: MaterialRef
  baseUnit: MaterialRef | null
  hasSupplier: boolean
  suppliers: MaterialRef[]
  /** Kho đang có vật tư (rỗng khi chưa gắn kho nào). */
  warehouses: MaterialWarehouse[]
}

/** Một phần tử `warehouses[]` của `MaterialResponseDto` — kho đang có vật tư, kèm tồn (đơn vị gốc). */
export type MaterialWarehouse = {
  slug: string
  code: string
  name: string
  quantity: number
  availableQuantity: number
}

export type MaterialInput = {
  code: string
  name: string
  typeSlug: string
  baseUnitSlug: string
  /** Vắng = backend mặc định 0. */
  minimumInventory?: number
  maximumInventory?: number
}

/** PATCH partial (`pickDefined`). Đổi `baseUnitSlug` bị khoá khi đã có tồn / đơn vị quy đổi khác (100723). */
export type MaterialUpdateInput = Partial<MaterialInput>

/**
 * Lọc `GET /materials` (ghép AND): `code` khớp đúng, `name` chứa chuỗi, `typeSlug` khớp đúng; `hasSupplier`
 * `false` = chưa thuộc nhà cung cấp nào, `true` = đã thuộc ít nhất một NCC. Giá trị sai → 100725.
 */
export type MaterialFilters = {
  name?: string
  code?: string
  typeSlug?: string
  hasSupplier?: boolean
}

/**
 * Một dòng `GET /materials/{slug}/conversion-units` (`MaterialConversionUnitResponseDto`). Danh sách GỒM dòng đơn vị
 * gốc (`isBaseUnit: true`, tỉ lệ 1). `conversionRate` = số đơn vị gốc trong 1 đơn vị này (1 BAG = 50 KG ⇒ 50).
 */
export type MaterialConversionUnit = {
  unitSlug: string
  unitCode: string
  unitName: string
  conversionRate: number
  isBaseUnit: boolean
}

/** Đơn vị gắn được (`GET .../conversion-units/available`, `UnitResponseDto`) — chỉ phần ô chọn cần. */
export type ConversionCandidate = {
  slug: string
  code: string
  name: string
}
