/**
 * Quyền cho luồng "thêm vật tư vào kho" từ phiếu nhập — trang tính (`pages/import-forms/model/abilities.ts`) rồi
 * truyền xuống (feature không import page).
 * - `search`: MATERIAL_READ — có điểm vào + tìm danh mục.
 * - `assign`: MATERIAL_UPDATE + WAREHOUSE_UPDATE (`PUT /warehouses/{w}/materials`).
 * - `create`: MATERIAL_CREATE + MATERIAL_UPDATE + WAREHOUSE_UPDATE (`POST`) + MATERIAL_READ + UNIT_READ (ô chọn loại / đơn vị).
 * - `attachSupplier`: SUPPLIER_READ + SUPPLIER_UPDATE + MATERIAL_UPDATE (ô NCC + `PUT /suppliers/{s}/materials`).
 */
export type MaterialAddAbilities = {
  search: boolean
  assign: boolean
  create: boolean
  attachSupplier: boolean
}

export const NO_MATERIAL_ADD: MaterialAddAbilities = {
  search: false,
  assign: false,
  create: false,
  attachSupplier: false,
}

/**
 * Vật tư vừa được thêm vào kho từ hộp "Thêm vật tư vào kho" — đủ để dòng phiếu chọn ngay, kể cả khi vật tư chưa nằm trong
 * 100 bản ghi đầu của `available-materials`. `label` = "mã · tên"; `baseUnit.label` = "mã đơn vị · tên đơn vị".
 */
export type AddedMaterial = {
  slug: string
  label: string
  baseUnit: { slug: string; label: string } | null
}

export const codeNameLabel = (code: string, name: string) => `${code} · ${name}`
