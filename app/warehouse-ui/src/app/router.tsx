import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LoginPage } from '@/features/auth/LoginPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/forbidden',
    element: <div className="p-8">Bạn không đủ quyền truy cập trang này.</div>,
  },
  { path: '/', element: <Navigate to="/examples" replace /> },
])
