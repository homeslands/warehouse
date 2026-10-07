import type { Role } from './types'

const SUPER_ADMIN = 'SUPER_ADMIN'

/**
 * Cấp của bốn vai trò có sẵn — đúng `level` backend seed (đọc `GET /roles` sandbox 2026-09-30). Chỉ dùng khi
 * người xem không có `ROLE_READ` (vd MANAGER) nên không tải được danh sách vai trò. Khác `ROLE_RANK` của
 * `entities/session` (thứ hạng 1–4): đây là `level` thật để so được với vai trò tự tạo.
 */
export const BUILT_IN_ROLE_LEVELS: Readonly<Record<string, number>> = {
  SUPER_ADMIN: 100,
  ADMIN: 30,
  MANAGER: 20,
  SUPERVISOR: 10,
}

/** Cấp của một vai trò. Không tra được (vai trò tự tạo khi không có danh sách) → `null`. */
export function resolveRoleLevel(roleName: string, roles?: readonly Role[]): number | null {
  const fromApi = roles?.find((role) => role.name === roleName)?.level
  if (fromApi !== undefined) return fromApi
  return Object.hasOwn(BUILT_IN_ROLE_LEVELS, roleName) ? BUILT_IN_ROLE_LEVELS[roleName] : null
}

/**
 * Cấp của người đang đăng nhập: `GET /auth/me` trả `role.level` từ PR #80 — dùng thẳng, vai trò tự tạo cũng
 * có cấp dù không có `ROLE_READ`. Phiên cũ chưa có `role` → tra danh sách/bảng như trước.
 */
function actorLevel(
  me: { roleName: string; role?: { level: number } },
  roles?: readonly Role[],
): number | null {
  return me.role?.level ?? resolveRoleLevel(me.roleName, roles)
}

/**
 * `me` có được thao tác trên `target` không — luật "chỉ quản lý cấp thấp hơn mình" của backend
 * (`RoleService.assertCanManage`). SUPER_ADMIN luôn được. Không biết cấp của một bên → KHÔNG (fail-closed).
 *
 * FE áp luật này cả cho reset mật khẩu. Backend (PR #80) mới chặn đặt lại cho người cấp CAO hơn, vẫn cho
 * người CÙNG cấp — FE chặt hơn (D3), xem proposal.
 */
export function canManageTarget(
  me: { roleName: string; role?: { level: number } },
  target: { roleName: string; role?: { level: number } },
  roles?: readonly Role[],
): boolean {
  if (me.roleName === SUPER_ADMIN) return true
  const myLevel = actorLevel(me, roles)
  // Backend trả `role.level` của từng user (PR #78) — dùng thẳng, vai trò tự tạo cũng có cấp.
  const targetLevel = target.role?.level ?? resolveRoleLevel(target.roleName, roles)
  return myLevel !== null && targetLevel !== null && targetLevel < myLevel
}

/** Vai trò `me` được gán cho người khác (form tạo/sửa). Giữ thứ tự backend trả. */
export function assignableRoles(
  me: { roleName: string; role?: { level: number } },
  roles: readonly Role[],
): Role[] {
  if (me.roleName === SUPER_ADMIN) return roles.filter((role) => role.name !== SUPER_ADMIN)
  const myLevel = actorLevel(me, roles)
  if (myLevel === null) return []
  return roles.filter((role) => {
    const level = resolveRoleLevel(role.name, roles)
    return level !== null && level < myLevel
  })
}
