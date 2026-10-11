import { can, type CurrentUser } from '@/entities/session'
import { canManageTarget, type Role } from '@/entities/user'

export type RoleAbilities = {
  create: boolean
  update: boolean
  delete: boolean
  /** Lối sang `/permissions` — đúng guard route đó (`MANAGE_PERMISSIONS` + `ROLE_READ`). */
  openPermissions: boolean
  /** Link "Xem người dùng của vai trò này" trong hộp xoá (100106). */
  viewUsers: boolean
}

/** Backend vai trò gác `@RequireAuthority(ROLE_*)` — mỗi nút một mã. Cấp bậc từng dòng xem `canActOnRole`. */
export function roleAbilities(user: CurrentUser | null): RoleAbilities {
  return {
    create: can(user, 'ROLE_CREATE'),
    update: can(user, 'ROLE_UPDATE'),
    delete: can(user, 'ROLE_DELETE'),
    openPermissions: can(user, 'MANAGE_PERMISSIONS') && can(user, 'ROLE_READ'),
    viewUsers: can(user, 'USER_READ'),
  }
}

/**
 * Thao tác được trên dòng này không: chỉ vai trò cấp THẤP HƠN mình (`RoleService.assertCanManage`), SUPER_ADMIN
 * miễn. Không biết cấp (vai trò tự tạo thiếu `level`) → không (fail-closed).
 */
export function canActOnRole(
  user: CurrentUser | null,
  role: Role,
  roles: readonly Role[],
): boolean {
  if (!user) return false
  return canManageTarget(
    user,
    { roleName: role.name, role: role.level === undefined ? undefined : { level: role.level } },
    roles,
  )
}
