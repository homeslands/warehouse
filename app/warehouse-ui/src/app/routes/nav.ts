import type { RouteObject } from 'react-router-dom'
import { hasRole, type CurrentUser, type Role } from '@/entities/session'
import type { NavGroup, NavItem } from '@/shared/lib/nav'
import { NAV_GROUP_ORDER, readHandle, type NavGroupKey } from './handle'

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

  const visit = (list: RouteObject[], parentPath: string, parentRoles: Role[] | undefined) => {
    for (const route of list) {
      const handle = readHandle(route.handle)
      const roles = handle.roles ?? parentRoles
      const path = joinPath(parentPath, route.path)

      if (handle.nav && (!roles || hasRole(user, ...roles))) {
        const items = byGroup.get(handle.nav.group) ?? []
        items.push({ to: path, labelKey: handle.nav.labelKey, icon: handle.nav.icon })
        byGroup.set(handle.nav.group, items)
      }
      if (route.children) visit(route.children, path, roles)
    }
  }
  visit(routes, '/', undefined)

  return NAV_GROUP_ORDER.flatMap((key) => {
    const items = byGroup.get(key)
    return items ? [{ key, labelKey: `nav:groups.${key}`, items }] : []
  })
}
