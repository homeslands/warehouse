/**
 * `MaterialResponseDto`. Danh mục không có `version`, không có `isActive`, không có `description`. Tên vật tư ĐƯỢC
 * trùng (backend không có mã lỗi trùng tên). `baseUnit*` có thể vắng ở dữ liệu cũ chưa có đơn vị gốc (100714).
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
  typeSlug: string
  typeCode: string
  typeName: string
  baseUnitSlug?: string | null
  baseUnitCode?: string | null
  baseUnitName?: string | null
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

/** Lọc `GET /materials` (ghép AND): `code` khớp đúng, `name` chứa chuỗi, `typeSlug` khớp đúng. */
export type MaterialFilters = {
  name?: string
  code?: string
  typeSlug?: string
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
