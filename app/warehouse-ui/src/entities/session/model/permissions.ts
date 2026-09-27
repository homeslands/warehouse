import type { AuthorityCode } from '@/shared/api/authority-codes'
import { ROLES, type Role } from './roles'

export type CurrentUser = {
  userId: string
  userName: string
  roleName: string
  /**
   * Mã authority mà role của user đang được cấp. `GET /auth/me` trả MẢNG (không phải chuỗi JSON).
   * Backend không ký `scope` vào JWT — mỗi request nó đọc lại từ Redis `rbac:user:{userId}`, nên
   * quyền admin vừa bật/tắt có hiệu lực ngay, không cần đăng nhập lại.
   */
  scope: string[]
}

/** Chặn dữ liệu lạ từ API; không parse gì — `scope` vốn đã là mảng. */
export function safeParseScope(scope: unknown): string[] {
  if (!Array.isArray(scope)) return []
  return scope.filter((x): x is string => typeof x === 'string')
}

/**
 * `SUPER_ADMIN` luôn qua, kể cả khi không có trong `roles` — khớp bypass của backend
 * (`AuthorityGuard`/`HasRoleGuard`). Danh sách rỗng với người thường → false.
 */
export function hasRole(user: CurrentUser | null, ...roles: Role[]): boolean {
  if (!user) return false
  if (user.roleName === ROLES.SUPER_ADMIN) return true
  return roles.some((role) => role === user.roleName)
}

/**
 * Có `authority` trong `scope` không. `SUPER_ADMIN` luôn true — `AuthorityGuard` của backend cho nó
 * qua TRƯỚC khi nhìn `scope`, và migration cố tình không cấp row `permission_tbl` nào cho nó.
 */
export function can(user: CurrentUser | null, authority: AuthorityCode): boolean {
  if (!user) return false
  if (user.roleName === ROLES.SUPER_ADMIN) return true
  return safeParseScope(user.scope).includes(authority)
}
