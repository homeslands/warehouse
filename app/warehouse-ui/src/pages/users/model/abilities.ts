import { can, ROLES, type CurrentUser } from '@/entities/session'
import {
  BUILT_IN_ROLE_LEVELS,
  canManageTarget,
  isSameUser,
  resolveRoleLevel,
  type Role,
  type User,
} from '@/entities/user'
import type { BackendCapabilities } from '@/shared/api/backend-capabilities'

export type UserRowAbilities = {
  resetPassword: boolean
  /** Sửa hồ sơ — `PATCH /users/{slug}`. */
  edit: boolean
  /** `POST /users/{slug}/change-role`. */
  changeRole: boolean
  /** Khoá / mở khoá — `PUT /users/{slug}/lock|unlock`. Hiện cả trên tài khoản đã khoá (Mở khoá). */
  toggleActive: boolean
}

export type UserAbilities = {
  create: boolean
  /** Ô lọc vai trò tải `GET /roles` — cần `ROLE_READ`. */
  filterByRole: boolean
  /** Ô tìm kiếm + lọc trạng thái — theo cờ `userSearch`. */
  search: boolean
  /**
   * Dòng này có được hiện không. TẠM: backend chưa lọc `GET /users` theo phạm vi (MANAGER nhận về toàn bộ người
   * dùng — proposal `docs/proposals/2026-09-30-user-management-api.md`, mục D1). Người dưới ADMIN chỉ thấy chính
   * mình + người cấp thấp hơn. Dữ liệu vẫn đã về tới trình duyệt — đây là lớp giao diện, không phải bảo mật.
   * Gỡ khi backend lọc.
   */
  visible: (target: User) => boolean
  row: (target: User) => UserRowAbilities
}

/** Chính mình — so bằng `userSlug` (PR #80), phiên cũ lùi về định danh đăng nhập (`isSameUser`). */
export function isSelf(
  me: CurrentUser | null,
  target: Pick<User, 'slug' | 'phonenumber'>,
): boolean {
  return isSameUser(me, target)
}

/** ADMIN trở lên (theo `level`, kể cả vai trò tự tạo cấp cao) — phạm vi toàn hệ thống. */
function seesEveryone(me: CurrentUser, roles: readonly Role[] | undefined): boolean {
  if (me.roleName === ROLES.SUPER_ADMIN) return true
  const level = me.role?.level ?? resolveRoleLevel(me.roleName, roles)
  return level !== null && level >= BUILT_IN_ROLE_LEVELS.ADMIN
}

/**
 * Người đang đăng nhập làm được gì trên màn người dùng. Mỗi thao tác = authority backend kiểm + luật cấp
 * vai trò (`canManageTarget`, fail-closed) + không thao tác trên chính mình.
 *
 * Sửa / đổi vai trò / khoá cùng một mã `USER_UPDATE` (backend PR #72). ADMIN không đụng được ADMIN khác
 * (backend 100417) — luật cấp đã chặn sẵn vì hai bên cùng cấp.
 *
 * `roles` = kết quả `GET /roles`, `undefined` khi người xem không có `ROLE_READ` (luật cấp lùi về bảng vai
 * trò có sẵn).
 */
export function userAbilities(
  me: CurrentUser | null,
  roles: readonly Role[] | undefined,
  flags: Pick<BackendCapabilities, 'userUpdate' | 'userStatus' | 'userSearch'>,
): UserAbilities {
  const readRoles = can(me, 'ROLE_READ')
  const update = can(me, 'USER_UPDATE')

  const manageable = (target: User): boolean =>
    me !== null && !isSelf(me, target) && canManageTarget(me, target, roles)

  return {
    create: can(me, 'USER_CREATE') && readRoles,
    filterByRole: readRoles,
    search: flags.userSearch,
    visible: (target) =>
      me !== null && (seesEveryone(me, roles) || isSelf(me, target) || manageable(target)),
    row: (target) => {
      const ok = manageable(target)
      return {
        resetPassword: ok && can(me, 'USER_CHANGE_PASSWORD'),
        edit: ok && flags.userUpdate && update,
        changeRole: ok && flags.userUpdate && update && readRoles,
        toggleActive: ok && flags.userStatus && update,
      }
    },
  }
}

export function hasAnyRowAbility(abilities: UserRowAbilities): boolean {
  return abilities.resetPassword || abilities.edit || abilities.changeRole || abilities.toggleActive
}
