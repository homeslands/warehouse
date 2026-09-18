import { FlaskConical } from 'lucide-react'
import { Outlet, createBrowserRouter, type RouteObject } from 'react-router-dom'
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
}

/**
 * Nguồn khai báo DUY NHẤT: menu (`buildNav`), chặn quyền (`RoleGate`) và breadcrumb đều đọc
 * `handle` của các route ở đây. Là hàm (không phải hằng) để test dựng được
 * `createMemoryRouter(createRoutes({ dev }))` — `createBrowserRouter` gắn vào window.history.
 *
 * Màn trong layout chính dùng `lazy` (mỗi màn một chunk JS). Login / 403 / 404 / trang lỗi giữ
 * import tĩnh: chúng phải hiện được cả khi tải chunk lỗi.
 */
export function createRoutes({ dev }: CreateRoutesOptions): RouteObject[] {
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
