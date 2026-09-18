import type { ParseKeys } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import type { Role } from '@/entities/session'

/** Thứ tự nhóm trên sidebar. Thêm nhóm = thêm vào đây + khoá `nav:groups.<key>`. */
export const NAV_GROUP_ORDER = ['catalog', 'admin', 'dev'] as const

export type NavGroupKey = (typeof NAV_GROUP_ORDER)[number]

/** Khoá của namespace `nav`, kiểm lúc biên dịch (`'nav:examples'`). */
export type NavKey = `nav:${ParseKeys<'nav'>}`

/**
 * `handle` của một route. Khai bằng `satisfies AppRouteHandle` ở mọi route.
 * - `roles`: không khai = mọi người đã đăng nhập; `roles: []` = chỉ `SUPER_ADMIN` (luôn qua, `hasRole`).
 *   Route con không khai thì thừa hưởng cha; khai riêng thì dùng của nó (có thể rộng hơn cha).
 * - `nav`: có thì route hiện trên sidebar, trong nhóm `group`.
 * - `crumb`: nhãn breadcrumb / tiêu đề tab.
 */
export type AppRouteHandle = {
  roles?: Role[]
  nav?: { group: NavGroupKey; labelKey: NavKey; icon: LucideIcon }
  crumb?: NavKey
}

function isNavGroupKey(value: unknown): value is NavGroupKey {
  return typeof value === 'string' && (NAV_GROUP_ORDER as readonly string[]).includes(value)
}

/**
 * `handle` của react-router có kiểu `unknown` — đọc có kiểm từng trường thay vì ép kiểu cả cục,
 * để một route khai sai không làm sập RoleGate/menu.
 */
export function readHandle(handle: unknown): AppRouteHandle {
  if (typeof handle !== 'object' || handle === null) return {}
  const { roles, nav, crumb } = handle as Record<string, unknown>
  const result: AppRouteHandle = {}
  if (Array.isArray(roles)) result.roles = roles.filter((r): r is Role => typeof r === 'string')
  if (typeof nav === 'object' && nav !== null) {
    const { group, labelKey, icon } = nav as Record<string, unknown>
    if (isNavGroupKey(group) && typeof labelKey === 'string' && icon) {
      result.nav = { group, labelKey: labelKey as NavKey, icon: icon as LucideIcon }
    }
  }
  if (typeof crumb === 'string') result.crumb = crumb as NavKey
  return result
}
