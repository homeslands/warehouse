import { FlaskConical, ShieldCheck, Store, Users, Warehouse } from 'lucide-react'
import { Outlet, createBrowserRouter, type RouteObject } from 'react-router-dom'
import { ROLES } from '@/entities/session'
import { BACKEND_SUPPORTS, type BackendCapabilities } from '@/shared/api/backend-capabilities'
import { LoginPage } from '@/pages/login'
import { ErrorPage } from '@/pages/error'
import { ForbiddenPage } from '@/pages/forbidden'
import { NotFoundPage } from '@/pages/not-found'
import { AppLayout } from './AppLayout'
import { ProtectedRoute } from './guards'
import { HydrateFallback } from './HydrateFallback'
import { RoleGate } from './RoleGate'
import type { AppRouteHandle } from './handle'
import { useNavGroups } from './nav-context'

/**
 * Màn chỉ dành cho dev. Điều kiện `import.meta.env.DEV` phải nằm NGAY TẠI ĐÂY (không chỉ ở tham số
 * `dev`): Vite thay nó bằng hằng lúc build nên bản production bỏ hẳn nhánh này, kể cả chunk JS
 * của màn Example. Chỉ truyền `dev: true` thì không đủ để có Example trong bản production.
 */
function devScreens(): RouteObject[] {
  if (!import.meta.env.DEV) return []
  return [
    {
      path: '/examples',
      lazy: () => import('@/pages/examples').then((m) => ({ Component: m.ExamplesPage })),
      handle: {
        nav: { group: 'dev', labelKey: 'nav:examples', icon: FlaskConical },
        crumb: 'nav:examples',
      } satisfies AppRouteHandle,
    },
  ]
}

export type CreateRoutesOptions = {
  /** `true` = thêm màn chỉ dành cho dev (Example). App thật truyền `import.meta.env.DEV`. */
  dev: boolean
  /**
   * Backend đã gác màn nào bằng authority — mặc định lấy từ `BACKEND_SUPPORTS`. Là tham số (không
   * đọc thẳng) để test dựng được cây route với cờ bật mà không phải mock module.
   */
  capabilities?: Pick<BackendCapabilities, 'authorityGuards' | 'storeAuthorityGuards'>
}

/**
 * Nguồn khai báo DUY NHẤT: menu (`buildNav`), chặn quyền (`RoleGate`) và breadcrumb đều đọc
 * `handle` của các route ở đây. Là hàm (không phải hằng) để test dựng được
 * `createMemoryRouter(createRoutes({ dev }))` — `createBrowserRouter` gắn vào window.history.
 *
 * Màn trong layout chính dùng `lazy` (mỗi màn một chunk JS). Login / 403 / 404 / trang lỗi giữ
 * import tĩnh: chúng phải hiện được cả khi tải chunk lỗi.
 */
export function createRoutes({
  dev,
  capabilities = BACKEND_SUPPORTS,
}: CreateRoutesOptions): RouteObject[] {
  // Thứ tự khai báo = thứ tự trong nhóm menu.
  const screens: RouteObject[] = [
    {
      index: true,
      lazy: () =>
        import('@/pages/home').then(({ HomePage }) => ({
          // Page không import app: route đọc menu từ NavContext rồi truyền xuống qua prop.
          Component: function HomeRoute() {
            return <HomePage nav={useNavGroups()} />
          },
        })),
      handle: { crumb: 'nav:home' } satisfies AppRouteHandle,
    },
    {
      path: '/warehouses',
      // Gác theo đúng thứ backend kiểm ở `GET /warehouses`: `@HasRole(Admin, Manager, Supervisor)`
      // hiện tại, hoặc `WAREHOUSE_READ` khi backend chuyển sang authority. Các nút ghi gác riêng
      // trong màn (`pages/warehouses/model/abilities.ts`). SUPER_ADMIN luôn qua.
      handle: {
        ...(capabilities.authorityGuards
          ? { authority: 'WAREHOUSE_READ' as const }
          : { roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SUPERVISOR] }),
        nav: { group: 'catalog', labelKey: 'nav:warehouses', icon: Warehouse },
        crumb: 'nav:warehouses',
      } satisfies AppRouteHandle,
      // Route cha không khai element → react-router render <Outlet />. Route con thừa hưởng gác
      // quyền (RoleGate lấy match sâu nhất có khai) và crumb "Kho".
      children: [
        {
          index: true,
          lazy: () => import('@/pages/warehouses').then((m) => ({ Component: m.WarehousesPage })),
        },
        {
          path: ':slug',
          lazy: () =>
            import('@/pages/warehouses').then((m) => ({ Component: m.WarehouseDetailPage })),
          handle: { crumb: 'nav:detail' } satisfies AppRouteHandle,
        },
      ],
    },
    {
      path: '/stores',
      // Như /warehouses nhưng theo cờ riêng: backend chưa có mã STORE_* nào (xem backend-capabilities).
      handle: {
        ...(capabilities.storeAuthorityGuards
          ? { authority: 'STORE_READ' as const }
          : { roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SUPERVISOR] }),
        nav: { group: 'catalog', labelKey: 'nav:stores', icon: Store },
        crumb: 'nav:stores',
      } satisfies AppRouteHandle,
      // Route cha không khai element → react-router render <Outlet />. Route con thừa hưởng gác
      // quyền (RoleGate lấy match sâu nhất có khai) và crumb "Cửa hàng".
      children: [
        {
          index: true,
          lazy: () => import('@/pages/stores').then((m) => ({ Component: m.StoresPage })),
        },
        {
          path: ':slug',
          lazy: () => import('@/pages/stores').then((m) => ({ Component: m.StoreDetailPage })),
          handle: { crumb: 'nav:detail' } satisfies AppRouteHandle,
        },
      ],
    },
    {
      path: '/account',
      lazy: () => import('@/pages/account').then((m) => ({ Component: m.AccountPage })),
      // Không khai `roles`: ai đăng nhập cũng xem được tài khoản của chính mình.
      // Không khai `nav`: vào từ menu tài khoản góc phải, không nằm trên sidebar.
      handle: { crumb: 'nav:account' } satisfies AppRouteHandle,
    },
    {
      path: '/users',
      lazy: () => import('@/pages/users').then((m) => ({ Component: m.UsersPage })),
      // Gác bằng authority như backend (`@RequireAuthority(USER_READ)` ở `GET /users`). Nút trong màn gác
      // riêng từng mã — `pages/users/model/abilities.ts`.
      handle: {
        authority: 'USER_READ',
        nav: { group: 'admin', labelKey: 'nav:users', icon: Users },
        crumb: 'nav:users',
      } satisfies AppRouteHandle,
    },
    {
      path: '/permissions',
      lazy: () => import('@/pages/permissions').then((m) => ({ Component: m.PermissionsPage })),
      // Gác bằng authority, KHÔNG bằng role: backend gác endpoint bật/tắt bằng
      // @RequireAuthority(MANAGE_PERMISSIONS). Gác bằng role thì admin bị thu hồi quyền vẫn vào
      // được màn rồi bấm gì cũng 403. Màn tải `GET /roles` — cần thêm `ROLE_READ` (`WMS-10-be(5)`).
      handle: {
        authority: ['MANAGE_PERMISSIONS', 'ROLE_READ'],
        nav: { group: 'admin', labelKey: 'nav:permissions', icon: ShieldCheck },
        crumb: 'nav:permissions',
      } satisfies AppRouteHandle,
    },
  ]

  if (dev) screens.push(...devScreens())

  return [
    {
      // Route gốc pathless: `errorElement` ở đây bắt lỗi render của TOÀN BỘ cây con — kể cả lỗi
      // tải chunk của route `lazy` (trang lỗi có nút "Tải lại").
      element: <Outlet />,
      errorElement: <ErrorPage />,
      // Lần tải đầu vào thẳng một màn `lazy`: router chờ chunk trước khi render — hiện vòng chờ
      // thay vì trang trắng (không có thì react-router còn cảnh báo thiếu HydrateFallback).
      hydrateFallbackElement: <HydrateFallback />,
      children: [
        { path: '/login', element: <LoginPage /> },
        { path: '/forbidden', element: <ForbiddenPage /> },
        {
          element: (
            <ProtectedRoute>
              <AppLayout screens={screens} />
            </ProtectedRoute>
          ),
          children: [{ element: <RoleGate />, children: screens }],
        },
        // Phải là con CUỐI của route gốc, KHÔNG phải con của nhánh ProtectedRoute:
        // nằm trong đó thì người chưa đăng nhập gõ sai URL sẽ bị đá sang /login thay vì thấy 404.
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ]
}

export const router = createBrowserRouter(createRoutes({ dev: import.meta.env.DEV }))
