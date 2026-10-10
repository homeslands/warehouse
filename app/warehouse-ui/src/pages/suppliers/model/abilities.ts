import type { BackendCapabilities } from '@/shared/api/backend-capabilities'
import { can, type CurrentUser } from '@/entities/session'

export type SupplierAbilities = {
  create: boolean
  update: boolean
  delete: boolean
  /** Tab Vật tư gọi `GET /suppliers/:slug/materials` = SUPPLIER_READ + MATERIAL_READ. */
  viewMaterials: boolean
  /** Ô tìm + khoảng ngày ở tab Vật tư (`supplierMaterialFilters`). */
  filterMaterials: boolean
  /** Gắn/gỡ = `@RequireAuthority(SupplierUpdate, MaterialUpdate)`; hộp gắn tải `GET /materials` (MATERIAL_READ). */
  manageMaterials: boolean
  /** Tab Giao dịch (`GET /suppliers/:slug/transactions`, SUPPLIER_READ) — chỉ khi backend mở API. */
  viewTransactions: boolean
  /** `POST /suppliers/:slug/transactions` = SUPPLIER_UPDATE, nằm trong tab Giao dịch. */
  recordTransaction: boolean
  /** Ô tìm trên danh sách (`supplierSearch`). */
  search: boolean
  /** Bấm tiêu đề cột để sắp xếp (`supplierSort`). */
  sort: boolean
}

/** Backend supplier dùng authority từ đầu — không có nhánh lùi theo vai trò (khác Kho/Cửa hàng). */
export function supplierAbilities(
  user: CurrentUser | null,
  caps: Pick<
    BackendCapabilities,
    'supplierSearch' | 'supplierSort' | 'supplierTransactions' | 'supplierMaterialFilters'
  >,
): SupplierAbilities {
  const read = can(user, 'SUPPLIER_READ')
  const viewMaterials = read && can(user, 'MATERIAL_READ')
  const viewTransactions = read && caps.supplierTransactions
  return {
    create: can(user, 'SUPPLIER_CREATE'),
    update: can(user, 'SUPPLIER_UPDATE'),
    delete: can(user, 'SUPPLIER_DELETE'),
    viewMaterials,
    filterMaterials: viewMaterials && caps.supplierMaterialFilters,
    manageMaterials: viewMaterials && can(user, 'SUPPLIER_UPDATE') && can(user, 'MATERIAL_UPDATE'),
    viewTransactions,
    recordTransaction: viewTransactions && can(user, 'SUPPLIER_UPDATE'),
    search: read && caps.supplierSearch,
    sort: read && caps.supplierSort,
  }
}
