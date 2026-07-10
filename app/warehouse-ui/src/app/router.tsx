import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { ExamplesPage } from '@/features/examples/ExamplesPage'
import { ProtectedRoute } from '@/shared/auth/guards'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/forbidden',
    element: <div className="p-8">Bạn không đủ quyền truy cập trang này.</div>,
  },
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
])
