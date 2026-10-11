/** Số vật tư đang dùng đơn vị (`UnitMaterialCountDto`). `total` đếm vật tư PHÂN BIỆT (dùng theo bất kỳ cách nào). */
export type UnitMaterialCount = {
  asBaseUnit: number
  asConversionUnit: number
  total: number
}

/**
 * `UnitResponseDto` của `GET /units` (danh sách). Danh mục không có `version`. `description` trả `null` khi trống.
 * `materialCount` CHỈ có ở danh sách — POST / PATCH / `GET /units/{slug}` không điền (xem `UnitRecord`).
 */
export type Unit = {
  slug: string
  createdAt: string
  updatedAt: string
  code: string
  name: string
  description?: string | null
  materialCount: UnitMaterialCount
}

/** Bản ghi đơn vị POST / PATCH trả về — không có `materialCount`. */
export type UnitRecord = Omit<Unit, 'materialCount'>

export type UnitInput = {
  code: string
  name: string
  description?: string
}

/** PATCH partial (`pickDefined`: bỏ `undefined`/`null`, GIỮ `''` → gửi `description: ''` để xoá trống). */
export type UnitUpdateInput = Partial<UnitInput>

/** Lọc `GET /units` (ghép AND): `code` khớp đúng (backend tự viết hoa), `name` chứa chuỗi. */
export type UnitFilters = {
  code?: string
  name?: string
}
