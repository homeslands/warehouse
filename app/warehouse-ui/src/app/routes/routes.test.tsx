import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { isValidElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter } from '@/shared/test/render'
import { createRoutes } from '@/app/routes'
import { RoleGate } from './RoleGate'

const BASE = 'http://localhost:8085/api/v1'

beforeEach(() => {
  server.use(mswHttp.get(`${BASE}/examples`, () => paginated([])))
})

/** Các route màn hình (`lazy`) trong cây, kèm chúng có nằm dưới layout `RoleGate` hay không. */
function lazyScreens(
  routes: RouteObject[],
  underGate = false,
): { route: RouteObject; underGate: boolean }[] {
  return routes.flatMap((route) => {
    const gated = underGate || (isValidElement(route.element) && route.element.type === RoleGate)
    return [
      ...(route.lazy ? [{ route, underGate: gated }] : []),
      ...lazyScreens(route.children ?? [], gated),
    ]
  })
}

describe('createRoutes', () => {
  it('dev: true → /examples tải lazy màn Example; menu có nhóm "Dev" với mục "Example"', async () => {
    renderWithRouter(createRoutes({ dev: true }), { route: '/examples', auth: 'admin' })

    expect(await screen.findByRole('heading', { name: 'Examples' })).toBeInTheDocument()
    expect(screen.getByText('Dev')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Example' })).toHaveAttribute('href', '/examples')
  })

  it('dev: false → /examples là 404', async () => {
    renderWithRouter(createRoutes({ dev: false }), { route: '/examples', auth: 'admin' })

    expect(await screen.findByText('Không tìm thấy trang')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Example' })).not.toBeInTheDocument()
  })

  it('dev: true → / là trang Tổng quan (lazy), có thẻ lối tắt tới Example; không còn chuyển sang /examples', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: true }), { auth: 'admin' })

    expect(await screen.findByRole('heading', { name: 'Xin chào, root!' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Dev' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('dev: false → / là Tổng quan, còn nhóm Danh mục nhưng không có mục Example', async () => {
    renderWithRouter(createRoutes({ dev: false }), { auth: 'admin' })

    expect(await screen.findByRole('region', { name: 'Danh mục' })).toBeInTheDocument()
    expect(screen.queryByText('Dev')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Example' })).not.toBeInTheDocument()
  })

  it('người dùng không đủ quyền cho màn nào → Tổng quan hiện câu rỗng', async () => {
    renderWithRouter(createRoutes({ dev: false }), { auth: 'customer' })

    expect(await screen.findByText('Chưa có chức năng nào được cấp quyền.')).toBeInTheDocument()
  })

  it('handle.crumb của route thật → breadcrumb "Tổng quan › Example" và tiêu đề tab', async () => {
    renderWithRouter(createRoutes({ dev: true }), { route: '/examples', auth: 'admin' })

    await screen.findByRole('heading', { name: 'Examples' })
    const trail = within(screen.getByRole('navigation', { name: 'Vị trí hiện tại' }))
    expect(trail.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('href', '/')
    expect(trail.getByText('Example')).toHaveAttribute('aria-current', 'page')
    expect(document.title).toBe('Example · Warehouse')
  })

  it('mọi màn (route lazy) đều nằm dưới layout RoleGate — handle.roles thật sự được kiểm', () => {
    // Test hành vi của RoleGate ở RoleGate.test.tsx; ở đây chỉ chứng minh createRoutes nối nó vào.
    // Duyệt cây thay vì render: màn thật hiện chưa màn nào khai roles để thấy /forbidden.
    const found = lazyScreens(createRoutes({ dev: true }))

    expect(found.length).toBeGreaterThanOrEqual(2) // Tổng quan + Example
    for (const { route, underGate } of found) {
      expect(underGate, `route ${route.path ?? '(index)'} không nằm dưới RoleGate`).toBe(true)
    }
  })

  it('tải nguội một màn lazy: route gốc hiện vòng chờ (hydrateFallbackElement) thay vì trang trắng', async () => {
    // Router chỉ cảnh báo "No `HydrateFallback` element..." khi KHÔNG route nào trong nhánh có
    // fallback; thấy vòng chờ = đã qua nhánh có fallback. (Cảnh báo là warningOnce theo module nên
    // không spy console.warn được một cách tin cậy giữa các test.)
    renderWithRouter(createRoutes({ dev: true }), { route: '/examples', auth: 'admin' })

    expect(screen.getByRole('status', { name: 'Đang tải...' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Examples' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Đang tải...' })).not.toBeInTheDocument()
  })
})

describe('createRoutes — màn Kho', () => {
  // `@/pages/warehouses` kéo theo cả widget Vật tư trong kho (bảng, sheet lịch sử, hộp thêm/gỡ) — lần
  // transform NGUỘI có thể vượt 1000ms mặc định của `findBy*`. Nạp module trước, ngoài mọi test.
  beforeAll(() => import('@/pages/warehouses'), 15000)

  beforeEach(() => {
    // Màn Kho của ADMIN nạp thêm ứng viên quản lý cho ô lọc (`useManagerCandidates`).
    server.use(
      mswHttp.get(`${BASE}/warehouses`, () => paginated([])),
      mswHttp.get(`${BASE}/roles`, () => ok([])),
      mswHttp.get(`${BASE}/users`, () => paginated([])),
    )
  })

  it.each([
    // Seed mặc định cấp WAREHOUSE_READ cho cả ba vai trò (ADMIN có thêm USER_READ cho ô lọc quản lý).
    [
      'ADMIN',
      {
        userName: 'admin',
        roleName: 'ADMIN',
        scope: ['WAREHOUSE_READ', 'USER_READ'],
      },
    ],
    ['MANAGER', { userName: 'quanly', roleName: 'MANAGER', scope: ['WAREHOUSE_READ'] }],
    ['SUPERVISOR', { userName: 'giamsat', roleName: 'SUPERVISOR', scope: ['WAREHOUSE_READ'] }],
  ])('%s (scope mặc định) xem được /warehouses và thấy mục menu "Kho"', async (_role, auth) => {
    renderWithRouter(createRoutes({ dev: false }), { route: '/warehouses', auth })

    expect(await screen.findByRole('heading', { name: 'Kho', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kho' })).toHaveAttribute('href', '/warehouses')
    expect(screen.getByText('Danh mục')).toBeInTheDocument()
  })

  it('thiếu WAREHOUSE_READ gõ thẳng URL → /forbidden và không có mục menu', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/warehouses',
      auth: 'customer',
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    expect(screen.queryByRole('link', { name: 'Kho' })).not.toBeInTheDocument()
  })

  it('breadcrumb "Tổng quan › Kho" và tiêu đề tab', async () => {
    renderWithRouter(createRoutes({ dev: false }), { route: '/warehouses', auth: 'admin' })

    await screen.findByRole('heading', { name: 'Kho', level: 1 })
    const trail = within(screen.getByRole('navigation', { name: 'Vị trí hiện tại' }))
    expect(trail.getByText('Kho')).toHaveAttribute('aria-current', 'page')
    expect(document.title).toBe('Kho · Warehouse')
  })
})

describe('createRoutes — màn Cửa hàng', () => {
  beforeEach(() => {
    server.use(mswHttp.get(`${BASE}/stores`, () => paginated([])))
  })

  it('ADMIN xem được /stores, menu có mục "Cửa hàng" sau "Kho" trong nhóm Danh mục', async () => {
    renderWithRouter(createRoutes({ dev: false }), { route: '/stores', auth: 'admin' })

    expect(await screen.findByRole('heading', { name: 'Cửa hàng', level: 1 })).toBeInTheDocument()
    const menu = within(screen.getByRole('navigation', { name: 'Menu chính' }))
    const links = menu.getAllByRole('link').map((a) => a.getAttribute('href'))
    // `auth: 'admin'` tiêm SUPER_ADMIN (xem `shared/test/render.tsx`), nó bypass mọi authority nên
    // cũng thấy `/permissions` (nhóm `admin`) — đúng hành vi, không phải hồi quy.
    expect(links).toEqual([
      '/',
      '/warehouses',
      '/stores',
      '/suppliers',
      '/materials',
      '/material-types',
      '/units',
      '/import-forms',
      '/export-forms',
      '/users',
      '/roles',
      '/permissions',
    ])
  })

  it('thiếu STORE_READ gõ thẳng /stores → /forbidden', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/stores',
      auth: 'customer',
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    expect(screen.queryByRole('link', { name: 'Cửa hàng' })).not.toBeInTheDocument()
  })
})

describe('createRoutes — màn Phân quyền cần MANAGE_PERMISSIONS và ROLE_READ', () => {
  beforeEach(() => {
    server.use(
      mswHttp.get(`${BASE}/roles`, () => ok([])),
      mswHttp.get(`${BASE}/authorities`, () => ok([])),
    )
  })
  const admin = (scope: string[]) => ({ userName: 'a', roleName: 'ADMIN', scope })

  it('chỉ có MANAGE_PERMISSIONS (màn sẽ 403 ở GET /roles) → /forbidden, không có mục menu', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/permissions',
      auth: admin(['MANAGE_PERMISSIONS']),
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    expect(screen.queryByRole('link', { name: 'Phân quyền' })).not.toBeInTheDocument()
  })

  it('có đủ hai mã → vào được, menu có mục "Phân quyền"', async () => {
    renderWithRouter(createRoutes({ dev: false }), {
      route: '/permissions',
      auth: admin(['MANAGE_PERMISSIONS', 'ROLE_READ']),
    })

    expect(await screen.findByRole('heading', { name: 'Phân quyền', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Phân quyền' })).toHaveAttribute('href', '/permissions')
  })
})

describe('gác /warehouses theo authority (cờ authorityGuards bật)', () => {
  const routes = () =>
    createRoutes({
      dev: false,
      capabilities: { authorityGuards: true, storeAuthorityGuards: false },
    })

  it('MANAGER thiếu WAREHOUSE_READ → /forbidden', async () => {
    const { router } = renderWithRouter(routes(), {
      route: '/warehouses',
      auth: { userName: 'm', roleName: 'MANAGER', scope: [] },
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })

  it('MANAGER có WAREHOUSE_READ → vào được', async () => {
    server.use(mswHttp.get(`${BASE}/warehouses`, () => paginated([])))
    const { router } = renderWithRouter(routes(), {
      route: '/warehouses',
      auth: { userName: 'm', roleName: 'MANAGER', scope: ['WAREHOUSE_READ'] },
    })

    expect(await screen.findByRole('heading', { name: 'Kho' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/warehouses')
  })
})

describe('gác /stores theo authority (cờ storeAuthorityGuards bật)', () => {
  const routes = () =>
    createRoutes({
      dev: false,
      capabilities: { authorityGuards: false, storeAuthorityGuards: true },
    })

  it('MANAGER thiếu STORE_READ → /forbidden', async () => {
    const { router } = renderWithRouter(routes(), {
      route: '/stores',
      auth: { userName: 'm', roleName: 'MANAGER', scope: [] },
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })

  it('MANAGER có STORE_READ → vào được', async () => {
    server.use(mswHttp.get(`${BASE}/stores`, () => paginated([])))
    renderWithRouter(routes(), {
      route: '/stores',
      auth: { userName: 'm', roleName: 'MANAGER', scope: ['STORE_READ'] },
    })

    expect(await screen.findByRole('heading', { name: 'Cửa hàng' })).toBeInTheDocument()
  })
})

describe('createRoutes — trang chi tiết kho', () => {
  beforeEach(() => {
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-ha-noi`, () =>
        ok({
          slug: 'kho-ha-noi',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          name: 'Kho Hà Nội 1',
          code: 'WH-HN-01',
          address: 'Hà Nội',
          isActive: true,
        }),
      ),
    )
  })

  it('breadcrumb "Tổng quan › Kho › <tên>", tiêu đề tab, mục menu "Kho" vẫn sáng', async () => {
    renderWithRouter(createRoutes({ dev: false }), {
      route: '/warehouses/kho-ha-noi',
      auth: 'admin',
    })

    await screen.findByRole('heading', { level: 1, name: 'Kho Hà Nội 1' })
    const trail = within(screen.getByRole('navigation', { name: 'Vị trí hiện tại' }))
    expect(trail.getByText('Kho Hà Nội 1')).toHaveAttribute('aria-current', 'page')
    expect(trail.getByRole('link', { name: 'Kho' })).toHaveAttribute('href', '/warehouses')
    expect(document.title).toBe('Kho Hà Nội 1 · Warehouse')
    expect(screen.getByRole('link', { name: 'Kho', current: 'page' })).toBeInTheDocument()
  })

  it('thiếu quyền xem kho → /forbidden', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/warehouses/kho-ha-noi',
      auth: { userName: 'm', roleName: 'MANAGER', scope: [] },
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })
})

describe('createRoutes — trang chi tiết cửa hàng', () => {
  it('breadcrumb "Tổng quan › Cửa hàng › <tên>" và tiêu đề tab', async () => {
    server.use(
      mswHttp.get(`${BASE}/stores/ch-ha-noi`, () =>
        ok({
          slug: 'ch-ha-noi',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          name: 'Cửa hàng Hà Nội 1',
          code: 'ST-HN-01',
          legalName: 'Công ty ABC',
          taxCode: '0101234567',
          isActive: true,
        }),
      ),
    )
    renderWithRouter(createRoutes({ dev: false }), { route: '/stores/ch-ha-noi', auth: 'admin' })

    await screen.findByRole('heading', { level: 1, name: 'Cửa hàng Hà Nội 1' })
    const trail = within(screen.getByRole('navigation', { name: 'Vị trí hiện tại' }))
    expect(trail.getByText('Cửa hàng Hà Nội 1')).toHaveAttribute('aria-current', 'page')
    expect(document.title).toBe('Cửa hàng Hà Nội 1 · Warehouse')
  })

  it('thiếu quyền xem cửa hàng → /forbidden', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/stores/ch-ha-noi',
      auth: { userName: 'm', roleName: 'MANAGER', scope: [] },
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })
})

describe('cờ TẮT (môi trường còn backend cũ, gác bằng @HasRole)', () => {
  const routes = () =>
    createRoutes({
      dev: false,
      capabilities: { authorityGuards: false, storeAuthorityGuards: false },
    })

  it.each(['/warehouses', '/stores'])(
    'MANAGER scope rỗng vẫn vào được %s — gác theo vai trò',
    async (path) => {
      server.use(
        mswHttp.get(`${BASE}/warehouses`, () => paginated([])),
        mswHttp.get(`${BASE}/stores`, () => paginated([])),
      )
      const { router } = renderWithRouter(routes(), {
        route: path,
        auth: { userName: 'm', roleName: 'MANAGER', scope: [] },
      })

      expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe(path)
    },
  )
})

describe('createRoutes — màn Người dùng cần USER_READ', () => {
  // Cây import của `@/pages/users` nặng hơn hẳn `@/pages/warehouses`/`@/pages/stores` (kéo theo
  // `UserFormSheet` + ba hộp thoại reset/khoá/xoá, mỗi cái một cụm zod/react-hook-form riêng) — lần
  // transform NGUỘI đầu tiên của Vitest có thể vượt quá 1000ms mặc định của `waitFor`/`findBy*`.
  // Nạp module một lần ở đây (ngoài mọi test) để cả hai test dưới đều chạy với timeout mặc định,
  // kể cả khi chạy MỘT MÌNH bằng `-t` (thứ tự chạy không còn quyết định kết quả).
  beforeAll(() => import('@/pages/users'), 15000)

  beforeEach(() => {
    server.use(
      mswHttp.get(`${BASE}/users`, () => paginated([])),
      mswHttp.get(`${BASE}/roles`, () => ok([])),
    )
  })

  it('SUPERVISOR (không USER_READ) gõ thẳng /users → /forbidden, không có mục menu, không gọi GET /users', async () => {
    let userCalls = 0
    server.use(
      mswHttp.get(`${BASE}/users`, () => {
        userCalls += 1
        return paginated([])
      }),
    )

    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/users',
      auth: { userName: '0330000000', roleName: 'SUPERVISOR', scope: [] },
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    expect(screen.queryByRole('link', { name: 'Người dùng' })).not.toBeInTheDocument()
    // RoleGate chặn TRƯỚC khi UsersPage mount — trang không bao giờ gọi `useUsers`.
    expect(userCalls).toBe(0)
  })

  it('MANAGER có USER_READ → vào được, menu có "Người dùng" trong nhóm Quản trị', async () => {
    renderWithRouter(createRoutes({ dev: false }), {
      route: '/users',
      auth: { userName: '0340000000', roleName: 'MANAGER', scope: ['USER_READ'] },
    })

    expect(await screen.findByRole('heading', { name: 'Người dùng', level: 1 })).toBeInTheDocument()
    const adminGroup = within(screen.getByRole('group', { name: 'Quản trị' }))
    expect(adminGroup.getByRole('link', { name: 'Người dùng' })).toHaveAttribute('href', '/users')
  })
})

describe('createRoutes — màn Đơn vị', () => {
  beforeEach(() => {
    server.use(mswHttp.get(`${BASE}/units`, () => paginated([])))
  })

  it('có UNIT_READ → vào được /units, menu có mục "Đơn vị"', async () => {
    renderWithRouter(createRoutes({ dev: false }), {
      route: '/units',
      auth: { userName: 'm', roleName: 'MANAGER', scope: ['UNIT_READ'] },
    })

    expect(await screen.findByRole('heading', { name: 'Đơn vị', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Đơn vị' })).toHaveAttribute('href', '/units')
  })

  it('thiếu UNIT_READ gõ thẳng /units → /forbidden', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/units',
      auth: 'customer',
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    expect(screen.queryByRole('link', { name: 'Đơn vị' })).not.toBeInTheDocument()
  })
})

describe('createRoutes — màn Loại vật tư', () => {
  beforeEach(() => {
    server.use(mswHttp.get(`${BASE}/material-types`, () => paginated([])))
  })

  it('có MATERIAL_READ → vào được, menu có "Loại vật tư"', async () => {
    renderWithRouter(createRoutes({ dev: false }), {
      route: '/material-types',
      auth: { userName: 'm', roleName: 'MANAGER', scope: ['MATERIAL_READ'] },
    })

    expect(
      await screen.findByRole('heading', { name: 'Loại vật tư', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Loại vật tư' })).toHaveAttribute(
      'href',
      '/material-types',
    )
  })

  it('thiếu MATERIAL_READ → /forbidden', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/material-types',
      auth: 'customer',
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })
})

describe('createRoutes — màn Vật tư', () => {
  beforeEach(() => {
    server.use(
      mswHttp.get(`${BASE}/materials`, () => paginated([])),
      mswHttp.get(`${BASE}/material-types`, () => paginated([])),
    )
  })

  it('có MATERIAL_READ → vào được /materials, menu có "Vật tư"', async () => {
    renderWithRouter(createRoutes({ dev: false }), {
      route: '/materials',
      auth: { userName: 'm', roleName: 'MANAGER', scope: ['MATERIAL_READ'] },
    })

    expect(await screen.findByRole('heading', { name: 'Vật tư', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vật tư' })).toHaveAttribute('href', '/materials')
  })

  it('/materials/:slug: breadcrumb kết thúc bằng tên vật tư', async () => {
    server.use(
      mswHttp.get(`${BASE}/materials/m-1`, () =>
        ok({
          slug: 'm-1',
          createdAt: '',
          updatedAt: '',
          code: 'VT-01',
          name: 'Xi măng',
          minimumInventory: 0,
          maximumInventory: 0,
          type: { slug: 'mt-1', code: 'MT-01', name: 'Vật liệu' },
          baseUnit: null,
          hasSupplier: false,
          suppliers: [],
          warehouses: [],
          units: [],
        }),
      ),
    )
    renderWithRouter(createRoutes({ dev: false }), { route: '/materials/m-1', auth: 'admin' })

    await screen.findByRole('heading', { level: 1, name: 'VT-01 · Xi măng' })
    const trail = within(screen.getByRole('navigation', { name: 'Vị trí hiện tại' }))
    await waitFor(() => expect(trail.getByText('Xi măng')).toHaveAttribute('aria-current', 'page'))
  })

  it('thiếu MATERIAL_READ → /forbidden', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/materials',
      auth: 'customer',
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })
})

describe('createRoutes — màn Vai trò', () => {
  beforeEach(() => {
    server.use(mswHttp.get(`${BASE}/roles`, () => ok([])))
  })

  it('có ROLE_READ → vào được /roles, menu có "Vai trò" ngay trước "Phân quyền"', async () => {
    renderWithRouter(createRoutes({ dev: false }), {
      route: '/roles',
      auth: { userName: 'a', roleName: 'ADMIN', scope: ['ROLE_READ', 'MANAGE_PERMISSIONS'] },
    })

    expect(await screen.findByRole('heading', { name: 'Vai trò', level: 1 })).toBeInTheDocument()
    const menu = within(screen.getByRole('navigation', { name: 'Menu chính' }))
    const links = menu.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links.indexOf('/roles')).toBeGreaterThan(-1)
    expect(links.indexOf('/roles')).toBe(links.indexOf('/permissions') - 1)
  })

  it('thiếu ROLE_READ gõ thẳng /roles → /forbidden', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/roles',
      auth: 'customer',
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })
})

describe('createRoutes — màn Phiếu nhập', () => {
  const READER = {
    userName: 'r',
    userSlug: 'u-r',
    roleName: 'MANAGER',
    scope: ['IMPORT_FORM_READ', 'WAREHOUSE_READ'],
  }
  beforeEach(() => {
    server.use(
      mswHttp.get(`${BASE}/warehouses`, () =>
        paginated([{ slug: 'w-a', code: 'KHO-A', name: 'Kho A', isActive: true }]),
      ),
      mswHttp.get(`${BASE}/warehouses/w-a/import-forms`, () => paginated([])),
    )
  })

  it('có READ + WAREHOUSE_READ → vào được, menu nhóm "Nghiệp vụ kho" có "Phiếu nhập"', async () => {
    renderWithRouter(createRoutes({ dev: false }), { route: '/import-forms', auth: READER })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Phiếu nhập kho' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Phiếu nhập' })).toHaveAttribute(
      'href',
      '/import-forms',
    )
    expect(screen.getByText('Nghiệp vụ kho')).toBeInTheDocument()
  })

  it('thiếu WAREHOUSE_READ → /forbidden', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/import-forms',
      auth: { ...READER, scope: ['IMPORT_FORM_READ'] },
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })

  it('/import-forms/new (link cũ) → chuyển về danh sách, giữ ?warehouse', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/import-forms/new?warehouse=w-a',
      auth: READER,
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/import-forms'))
    expect(router.state.location.search).toContain('warehouse=w-a')
  })
})

describe('createRoutes — màn Phiếu xuất', () => {
  const READER = {
    userName: 'r',
    userSlug: 'u-r',
    roleName: 'MANAGER',
    scope: ['EXPORT_FORM_READ', 'WAREHOUSE_READ'],
  }
  beforeEach(() => {
    server.use(
      mswHttp.get(`${BASE}/warehouses`, () =>
        paginated([{ slug: 'w-a', code: 'KHO-A', name: 'Kho A', isActive: true }]),
      ),
      mswHttp.get(`${BASE}/warehouses/w-a/export-forms`, () => paginated([])),
    )
  })

  it('có EXPORT_FORM_READ + WAREHOUSE_READ → vào được, menu "Nghiệp vụ kho" có "Phiếu xuất" sau "Phiếu nhập"', async () => {
    renderWithRouter(createRoutes({ dev: false }), {
      route: '/export-forms',
      auth: { ...READER, scope: [...READER.scope, 'IMPORT_FORM_READ'] },
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Phiếu xuất kho' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Phiếu xuất' })).toHaveAttribute(
      'href',
      '/export-forms',
    )
    expect(screen.getByText('Nghiệp vụ kho')).toBeInTheDocument()
    const menu = within(screen.getByRole('navigation', { name: 'Menu chính' }))
    const links = menu.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links.indexOf('/export-forms')).toBe(links.indexOf('/import-forms') + 1)
  })

  it('thiếu WAREHOUSE_READ → /forbidden, không có mục menu', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/export-forms',
      auth: { ...READER, scope: ['EXPORT_FORM_READ'] },
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    expect(screen.queryByRole('link', { name: 'Phiếu xuất' })).not.toBeInTheDocument()
  })

  it('thiếu EXPORT_FORM_READ → /forbidden (cả trang chi tiết)', async () => {
    const { router } = renderWithRouter(createRoutes({ dev: false }), {
      route: '/export-forms/xf-1?warehouse=w-a',
      auth: { ...READER, scope: ['WAREHOUSE_READ'] },
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })

  it('/export-forms/:slug → trang chi tiết', async () => {
    server.use(
      mswHttp.get(`${BASE}/warehouses/w-a`, () =>
        ok({ slug: 'w-a', code: 'KHO-A', name: 'Kho A', isActive: true }),
      ),
      mswHttp.get(`${BASE}/warehouses/w-a/export-forms/xf-1`, () =>
        ok({
          slug: 'xf-1',
          createdAt: '2026-10-26T02:00:00.000Z',
          updatedAt: '2026-10-26T02:00:00.000Z',
          version: 1,
          code: 'PX-0001',
          type: 'OTHER',
          status: 'DRAFT',
          purchaseOrder: 'PO-1',
          invoiceCode: null,
          requesterSlug: 'u-x',
          requesterName: 'X',
          approverSlug: null,
          approverName: null,
          receiver: 'Y',
          totalAmount: 0,
          note: null,
          file: null,
          warehouseSlug: 'w-a',
          items: [],
        }),
      ),
    )
    renderWithRouter(createRoutes({ dev: false }), {
      route: '/export-forms/xf-1?warehouse=w-a',
      auth: READER,
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: /PX-0001/ }, { timeout: 5000 }),
    ).toBeInTheDocument()
  })
})
