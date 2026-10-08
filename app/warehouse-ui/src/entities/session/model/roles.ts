/** Khớp `RoleEnum` của backend (`warehouse-api/src/role/role.enum.ts`). */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SUPERVISOR: 'SUPERVISOR',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

/**
 * Cấp bậc vai trò — số lớn hơn là cấp cao hơn. Dùng cho luật "chỉ sửa quyền của vai trò thấp hơn
 * mình" (R1 trong `docs/proposals/2026-09-25-permission-delegation-rules.md`). Phải khớp `ROLE_RANK`
 * của backend.
 */
export const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  MANAGER: 2,
  SUPERVISOR: 1,
}

/**
 * Vai trò bị backend giới hạn trong phạm vi kho: `GET /warehouses` / `GET /stores` chỉ trả kho mình quản lý HOẶC là
 * thành viên (và cửa hàng gắn các kho đó); `managerSlug`/`hasManager` bị bỏ qua. Khớp `WAREHOUSE_SCOPED_ROLES`
 * (`warehouse-api/src/warehouse/warehouse.constants.ts`, PR #72). Backend so tên vai trò, KHÔNG miễn SUPER_ADMIN.
 */
export const WAREHOUSE_SCOPED_ROLES: readonly Role[] = [ROLES.MANAGER, ROLES.SUPERVISOR]

export function isWarehouseScoped(roleName: string | undefined): boolean {
  return WAREHOUSE_SCOPED_ROLES.some((role) => role === roleName)
}
