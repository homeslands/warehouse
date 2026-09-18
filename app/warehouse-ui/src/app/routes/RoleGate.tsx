import { Navigate, Outlet, useMatches } from 'react-router-dom'
import { hasRole, useAuthStore } from '@/entities/session'
import { readHandle } from './handle'

/**
 * Layout đứng giữa AppShell và các màn: lấy `handle.roles` của match SÂU NHẤT có khai `roles`;
 * không đủ quyền → /forbidden. Không có `roles` = mọi người đã đăng nhập (ProtectedRoute đã
 * chặn người chưa đăng nhập ở tầng trên).
 */
export function RoleGate() {
  const matches = useMatches()
  const user = useAuthStore((s) => s.user)

  const roles = matches
    .map((match) => readHandle(match.handle).roles)
    .findLast((r) => r !== undefined)

  if (roles && !hasRole(user, ...roles)) return <Navigate to="/forbidden" replace />
  return <Outlet />
}
