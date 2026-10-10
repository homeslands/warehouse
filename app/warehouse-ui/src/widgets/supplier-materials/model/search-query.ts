import { isCodeLike, type SupplierMaterialFilters } from '@/entities/supplier'

export type SupplierMaterialSearchQuery = Pick<SupplierMaterialFilters, 'code' | 'name'>

/**
 * Một ô tìm, hai tham số backend (ghép AND nên không gửi chung): chuỗi trông như mã (`NL04`, `mat-001`) → `code`
 * viết hoa (khớp đúng); còn lại → `name` (chứa chuỗi).
 */
export function toMaterialSearchQuery(search: string): SupplierMaterialSearchQuery {
  const value = search.trim()
  if (value === '') return {}
  return isCodeLike(value) ? { code: value.toUpperCase() } : { name: value }
}
