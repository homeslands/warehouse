/** `MaterialTypeResponseDto`. Danh mục không có `version`. `description` trả `null` khi trống. */
export type MaterialType = {
  slug: string
  createdAt: string
  updatedAt: string
  code: string
  name: string
  description?: string | null
}

export type MaterialTypeInput = {
  code: string
  name: string
  description?: string
}

/** PATCH partial (`pickDefined` giữ `''` → gửi `description: ''` để xoá trống). */
export type MaterialTypeUpdateInput = Partial<MaterialTypeInput>

/** Lọc `GET /material-types` (ghép AND): `code` khớp đúng, `name` chứa chuỗi. */
export type MaterialTypeFilters = {
  code?: string
  name?: string
}
