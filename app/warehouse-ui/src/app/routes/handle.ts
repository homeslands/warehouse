import type { ParseKeys } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import { can, type CurrentUser, type Role } from '@/entities/session'
import type { AuthorityCode } from '@/shared/api/authority-codes'

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
  /**
   * `Authority.code` mà route này đòi (vd `'MANAGE_PERMISSIONS'`). Mảng = phải có **tất cả** (AND, như
   * `@RequireAuthority(A, B)`) — dùng khi màn gọi nhiều endpoint gác bằng mã khác nhau. Khai cùng
   * `roles` thì phải qua CẢ HAI — khớp backend, nơi `@HasRole` và `@RequireAuthority` là hai guard độc lập.
   */
  authority?: AuthorityCode | readonly AuthorityCode[]
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
  const { roles, authority, nav, crumb } = handle as Record<string, unknown>
  const result: AppRouteHandle = {}
  if (Array.isArray(roles)) result.roles = roles.filter((r): r is Role => typeof r === 'string')
  // Chuỗi rỗng phải coi như KHÔNG khai `authority` — `can()`/`RoleGate` kiểm truthy, nên `''` sẽ
  // là fail-open (không gác) trong khi `roles: []` là fail-closed. Bất đối xứng ở chỗ liên quan
  // tới quyền là chỗ dễ bị lợi dụng nhất.
  // Mã lạ lúc chạy vẫn giữ nguyên (không bỏ đi): `can()` trả `false` → đóng, không mở toang route.
  if (typeof authority === 'string' && authority !== '')
    result.authority = authority as AuthorityCode
  if (Array.isArray(authority)) {
    const codes = authority.filter((a): a is AuthorityCode => typeof a === 'string' && a !== '')
    if (codes.length > 0) result.authority = codes
  }
  if (typeof nav === 'object' && nav !== null) {
    const { group, labelKey, icon } = nav as Record<string, unknown>
    if (isNavGroupKey(group) && typeof labelKey === 'string' && icon) {
      result.nav = { group, labelKey: labelKey as NavKey, icon: icon as LucideIcon }
    }
  }
  if (typeof crumb === 'string') result.crumb = crumb as NavKey
  return result
}

/** Người dùng có đủ (mọi) mã mà `handle.authority` đòi không. */
export function hasAuthority(
  user: CurrentUser | null,
  authority: AuthorityCode | readonly AuthorityCode[],
): boolean {
  const codes: readonly AuthorityCode[] = typeof authority === 'string' ? [authority] : authority
  return codes.every((code) => can(user, code))
}
