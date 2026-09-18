import { Boxes, FlaskConical, Package, Users } from 'lucide-react'
import type { RouteObject } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ROLES, type CurrentUser } from '@/entities/session'
import type { NavGroup } from '@/shared/lib/nav'
import { createRoutes } from '@/app/routes'
import type { AppRouteHandle } from './handle'
import { buildNav } from './nav'

const asUser = (roleName: string): CurrentUser => ({
  userId: 'u1',
  userName: 'tester',
  roleName,
  scope: '[]',
})

// Cây giả: khai lẫn thứ tự nhóm (dev trước catalog) để kiểm buildNav tự xếp lại.
const tree: RouteObject[] = [
  {
    element: null,
    children: [
      { path: '/', handle: { crumb: 'nav:home' } satisfies AppRouteHandle },
      {
        path: '/examples',
        handle: {
          nav: { group: 'dev', labelKey: 'nav:examples', icon: FlaskConical },
        } satisfies AppRouteHandle,
      },
      {
        path: '/materials',
        handle: {
          roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SUPERVISOR],
          nav: { group: 'catalog', labelKey: 'nav:examples', icon: Package },
        } satisfies AppRouteHandle,
      },
      {
        path: '/users',
        handle: {
          roles: [ROLES.ADMIN],
          nav: { group: 'admin', labelKey: 'nav:examples', icon: Users },
        } satisfies AppRouteHandle,
      },
      {
        path: '/warehouses',
        handle: {
          roles: [ROLES.ADMIN, ROLES.MANAGER],
          nav: { group: 'catalog', labelKey: 'nav:examples', icon: Boxes },
        } satisfies AppRouteHandle,
        children: [
          // Không tự khai roles → thừa hưởng roles của cha (như RoleGate). Đường dẫn tương đối.
          {
            path: 'transfers',
            handle: {
              nav: { group: 'catalog', labelKey: 'nav:examples', icon: Boxes },
            } satisfies AppRouteHandle,
          },
        ],
      },
    ],
  },
]

/** Rút gọn kết quả thành { nhóm: [đường dẫn] } để so cho dễ đọc. */
const shape = (nav: NavGroup[]) => nav.map((g) => [g.key, g.items.map((i) => i.to)])

describe('buildNav', () => {
  it('SUPER_ADMIN thấy tất cả; nhóm theo thứ tự catalog → admin → dev; mục theo thứ tự khai báo', () => {
    expect(shape(buildNav(tree, asUser('SUPER_ADMIN')))).toEqual([
      ['catalog', ['/materials', '/warehouses', '/warehouses/transfers']],
      ['admin', ['/users']],
      ['dev', ['/examples']],
    ])
  })

  it('ADMIN thấy mọi mục khai ADMIN', () => {
    expect(shape(buildNav(tree, asUser('ADMIN')))).toEqual([
      ['catalog', ['/materials', '/warehouses', '/warehouses/transfers']],
      ['admin', ['/users']],
      ['dev', ['/examples']],
    ])
  })

  it('MANAGER: bỏ mục không đủ quyền, nhóm rỗng (admin) bị bỏ', () => {
    expect(shape(buildNav(tree, asUser('MANAGER')))).toEqual([
      ['catalog', ['/materials', '/warehouses', '/warehouses/transfers']],
      ['dev', ['/examples']],
    ])
  })

  it('SUPERVISOR: route con thừa hưởng roles của cha', () => {
    expect(shape(buildNav(tree, asUser('SUPERVISOR')))).toEqual([
      ['catalog', ['/materials']],
      ['dev', ['/examples']],
    ])
  })

  it('chưa đăng nhập: chỉ còn mục không khai roles', () => {
    expect(shape(buildNav(tree, null))).toEqual([['dev', ['/examples']]])
  })

  it('nhãn nhóm là khoá nav:groups.<key>; mục mang labelKey và icon của handle', () => {
    const [catalog] = buildNav(tree, asUser('SUPER_ADMIN'))
    expect(catalog.labelKey).toBe('nav:groups.catalog')
    expect(catalog.items[0]).toEqual({ to: '/materials', labelKey: 'nav:examples', icon: Package })
  })

  it('route không có handle.nav (vd /) không vào menu; handle sai kiểu bị bỏ qua', () => {
    const odd: RouteObject[] = [
      { path: '/a', handle: 'không phải object' },
      { path: '/b', handle: { nav: { group: 'khong-co', labelKey: 'nav:home', icon: Boxes } } },
      { path: '/c', handle: null },
    ]
    expect(buildNav(odd, asUser('SUPER_ADMIN'))).toEqual([])
  })

  it('nhóm dev chỉ có khi cây route có route dev (createRoutes({ dev: true }))', () => {
    const root = asUser('SUPER_ADMIN')
    expect(buildNav(createRoutes({ dev: true }), root).map((g) => g.key)).toContain('dev')
    expect(buildNav(createRoutes({ dev: false }), root).map((g) => g.key)).not.toContain('dev')
  })
})
