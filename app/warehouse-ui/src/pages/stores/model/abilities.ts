import { can, hasRole, ROLES, type CurrentUser } from '@/entities/session'
import type { BackendCapabilities } from '@/shared/api/backend-capabilities'

export type StoreAbilities = {
  create: boolean
  /** Sửa **và** ngừng/mở hoạt động — cả hai đều là `PATCH /stores/:slug`. */
  update: boolean
  assignWarehouse: boolean
  delete: boolean
  /** Xem kho liên kết như link sang trang chi tiết kho — cần đọc được KHO, không phải sửa được nó. */
  viewWarehouse: boolean
}

/**
 * Người đang đăng nhập làm được gì trên màn cửa hàng — theo **đúng thứ backend đang kiểm**.
 * Hai cờ độc lập: cửa hàng (`storeAuthorityGuards`) và kho (`authorityGuards`) có thể chuyển sang
 * authority ở hai đợt deploy khác nhau.
 */
export function storeAbilities(
  user: CurrentUser | null,
  flags: Pick<BackendCapabilities, 'authorityGuards' | 'storeAuthorityGuards'>,
): StoreAbilities {
  // Hộp gán kho tải `GET /warehouses` — gác theo đúng thứ endpoint ĐÓ đang kiểm.
  const readWarehouses = flags.authorityGuards
    ? can(user, 'WAREHOUSE_READ')
    : hasRole(user, ROLES.ADMIN, ROLES.MANAGER, ROLES.SUPERVISOR)

  if (!flags.storeAuthorityGuards) {
    // Backend còn `@HasRole(RoleEnum.Admin)` cho mọi endpoint ghi của cửa hàng.
    const admin = hasRole(user, ROLES.ADMIN)
    return {
      create: admin,
      update: admin,
      assignWarehouse: admin && readWarehouses,
      delete: admin,
      viewWarehouse: readWarehouses,
    }
  }

  return {
    create: can(user, 'STORE_CREATE'),
    update: can(user, 'STORE_UPDATE'),
    // `PUT /stores/:slug/warehouse` = `@RequireAuthority(StoreUpdate, WarehouseUpdate)` — AND, backend
    // không có mã riêng cho việc gán. Cộng quyền đọc kho vì hộp gán tải `GET /warehouses`.
    assignWarehouse: can(user, 'STORE_UPDATE') && can(user, 'WAREHOUSE_UPDATE') && readWarehouses,
    delete: can(user, 'STORE_DELETE'),
    viewWarehouse: readWarehouses,
  }
}
