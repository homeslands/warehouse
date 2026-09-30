import { useRef } from 'react'
import { Navigate, Outlet, useLocation, useMatches } from 'react-router-dom'
import { hasRole, useAuthStore } from '@/entities/session'
import { hasAuthority, readHandle } from './handle'

/**
 * Layout đứng giữa AppShell và các màn. Hai trục gác độc lập, mỗi trục lấy giá trị của match SÂU
 * NHẤT có khai nó; khai cả hai thì phải qua cả hai (AND) — khớp backend. Không khai gì = mọi người
 * đã đăng nhập (ProtectedRoute đã chặn người chưa đăng nhập ở tầng trên).
 */
export function RoleGate() {
  const matches = useMatches()
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  // Màn gần nhất đã cho vào. Bị chặn ngay tại ĐÚNG màn này = vừa còn quyền, giờ thì không — tức
  // quyền đổi giữa phiên (403 → nạp lại quyền, hoặc quay lại tab). Trang 403 khi đó nói rõ lý do
  // thay vì câu chung, vì với người dùng màn hình "tự dưng" biến mất. Tự gõ URL không có quyền thì
  // ref chưa từng là đường dẫn này → câu chung.
  const lastAllowed = useRef<string | null>(null)
  const handles = matches.map((match) => readHandle(match.handle))

  const roles = handles.map((h) => h.roles).findLast((r) => r !== undefined)
  const authority = handles.map((h) => h.authority).findLast((a) => a !== undefined)

  const denied =
    (roles && !hasRole(user, ...roles)) || (authority && !hasAuthority(user, authority))
  if (denied) {
    const to =
      lastAllowed.current === pathname ? '/forbidden?reason=permissionChanged' : '/forbidden'
    return <Navigate to={to} replace />
  }

  lastAllowed.current = pathname
  return <Outlet />
}
