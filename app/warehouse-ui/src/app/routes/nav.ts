import type { RouteObject } from 'react-router-dom'
import { can, hasRole, type CurrentUser, type Role } from '@/entities/session'
import type { NavGroup, NavItem } from '@/shared/lib/nav'
import { NAV_GROUP_ORDER, readHandle, type NavGroupKey } from './handle'
import type { AuthorityCode } from '@/shared/api/authority-codes'

function joinPath(parent: string, path: string | undefined): string {
  if (path === undefined) return parent
  if (path.startsWith('/')) return path
  return `${parent.replace(/\/$/, '')}/${path}`
}

/**
 * Menu = các route có `handle.nav` mà `user` đủ quyền, gom theo nhóm (thứ tự `NAV_GROUP_ORDER`),
 * trong nhóm giữ thứ tự khai báo, bỏ nhóm rỗng. `roles` của route cha áp cho route con không tự
 * khai — cùng cách `RoleGate` lấy `roles` của match sâu nhất có khai.
 */
export function buildNav(routes: RouteObject[], user: CurrentUser | null): NavGroup[] {
  const byGroup = new Map<NavGroupKey, NavItem[]>()

  const visit = (
    list: RouteObject[],
    parentPath: string,
    parentRoles: Role[] | undefined,
    parentAuthority: AuthorityCode | undefined,
  ) => {
    for (const route of list) {
      const handle = readHandle(route.handle)
      const roles = handle.roles ?? parentRoles
      const authority = handle.authority ?? parentAuthority
      const path = joinPath(parentPath, route.path)

      const allowed = (!roles || hasRole(user, ...roles)) && (!authority || can(user, authority))
      if (handle.nav && allowed) {
        const items = byGroup.get(handle.nav.group) ?? []
        items.push({ to: path, labelKey: handle.nav.labelKey, icon: handle.nav.icon })
        byGroup.set(handle.nav.group, items)
      }
      if (route.children) visit(route.children, path, roles, authority)
    }
  }
  visit(routes, '/', undefined, undefined)

  return NAV_GROUP_ORDER.flatMap((key) => {
    const items = byGroup.get(key)
    return items ? [{ key, labelKey: `nav:groups.${key}`, items }] : []
  })
}
