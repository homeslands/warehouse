import { can, hasRole, ROLES, type CurrentUser } from '@/entities/session'
import type { BackendCapabilities } from '@/shared/api/backend-capabilities'

export type WarehouseAbilities = {
  create: boolean
  /** Sửa **và** ngừng/mở hoạt động — cả hai đều là `PATCH /warehouses/:slug`. */
  update: boolean
  assignManager: boolean
  delete: boolean
  /** Ô lọc theo quản lý gọi `GET /users`. */
  filterByManager: boolean
  /** Khối Thành viên = `GET /users?warehouseSlug=`. */
  viewMembers: boolean
  /** Thêm/gỡ thành viên: `WAREHOUSE_UPDATE` + `USER_READ` (hộp thêm tải danh sách ứng viên). */
  manageMembers: boolean
}

/**
 * Người đang đăng nhập làm được gì trên màn kho — theo **đúng thứ backend đang kiểm**.
 *
 * `flags` truyền vào (không đọc `BACKEND_SUPPORTS` trực tiếp) để test chạy được cả hai nhánh mà
 * không phải mock module.
 */
export function warehouseAbilities(
  user: CurrentUser | null,
  flags: Pick<BackendCapabilities, 'authorityGuards' | 'userSearch'>,
): WarehouseAbilities {
  // Khối Thành viên dùng `GET /users?warehouseSlug=`; backend cũ bỏ qua tham số này và trả mọi người
  // dùng → phải đóng cả khối khi cờ `userSearch` tắt.
  const membersOpen = flags.userSearch
  if (!flags.authorityGuards) {
    // Backend còn `@HasRole(RoleEnum.Admin)` cho mọi endpoint ghi của kho và `GET /users`.
    const admin = hasRole(user, ROLES.ADMIN)
    return {
      create: admin,
      update: admin,
      assignManager: admin,
      delete: admin,
      filterByManager: admin,
      viewMembers: membersOpen && admin,
      manageMembers: membersOpen && admin,
    }
  }

  // Danh sách ứng viên quản lý = `GET /roles` (tìm slug vai trò MANAGER, cần `ROLE_READ` từ `WMS-10-be(5)`)
  // + `GET /users?roleSlug=` (cần `USER_READ`). Thiếu một trong hai là ô chọn rỗng kèm 403.
  const readUsers = can(user, 'USER_READ') && can(user, 'ROLE_READ')
  return {
    create: can(user, 'WAREHOUSE_CREATE'),
    update: can(user, 'WAREHOUSE_UPDATE'),
    // Hộp gán phải tải danh sách quản lý (`GET /users`) — thiếu USER_READ thì mở ra một ô chọn
    // rỗng rồi ăn 403, nên cần CẢ HAI.
    assignManager: can(user, 'WAREHOUSE_ASSIGN_MANAGER') && readUsers,
    delete: can(user, 'WAREHOUSE_DELETE'),
    filterByManager: readUsers,
    viewMembers: membersOpen && can(user, 'USER_READ'),
    manageMembers: membersOpen && can(user, 'WAREHOUSE_UPDATE') && can(user, 'USER_READ'),
  }
}
