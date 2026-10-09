/** Vật tư rút gọn đủ cho ô chọn vật tư (`MaterialResponseDto`). */
export type Material = {
  slug: string
  code: string
  name: string
  typeSlug?: string | null
  typeName?: string | null
  baseUnitSlug?: string | null
  baseUnitCode?: string | null
  baseUnitName?: string | null
}

export type MaterialFilters = {
  name?: string
  code?: string
}
