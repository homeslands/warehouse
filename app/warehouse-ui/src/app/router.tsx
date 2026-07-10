import { Outlet, createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { ErrorPage } from '@/features/error/ErrorPage'
import { ForbiddenPage } from '@/features/error/ForbiddenPage'
import { NotFoundPage } from '@/features/error/NotFoundPage'
import { ExamplesPage } from '@/features/examples/ExamplesPage'
import { ProtectedRoute } from '@/shared/auth/guards'

/**
 * Tách khỏi `router` để test dựng được `createMemoryRouter(routes, ...)`.
 * `createBrowserRouter` gắn vào window.history nên không dùng lại được trong test.
 */
export const routes: RouteObject[] = [
  {
    // Route gốc pathless: `errorElement` ở đây bắt lỗi render của TOÀN BỘ cây con.
    element: <Outlet />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forbidden', element: <ForbiddenPage /> },
      {
        element: (
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        ),
        children: [
          { path: '/', element: <Navigate to="/examples" replace /> },
          { path: '/examples', element: <ExamplesPage /> },
        ],
      },
      // Phải là con CUỐI của route gốc, KHÔNG phải con của nhánh ProtectedRoute:
      // nằm trong đó thì người chưa đăng nhập gõ sai URL sẽ bị đá sang /login thay vì thấy 404.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
