import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore, useSessionActivityV1, useSessionV1 } from '@/entities/session'
import { lockedPathFor, loginPathFor } from './login-path'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const endReason = useAuthStore((s) => s.endReason)
  const location = useLocation()

  if (status === 'loading') return null
  if (status !== 'authenticated') return <Navigate to={loginPathFor(location, endReason)} replace />
  return <>{children}</>
}

/**
 * Gác vùng cần đăng nhập khi cờ `apiV1Auth` bật: `locked` → UI-02 (`/locked`, che toàn bộ nội dung),
 * không phiên → UI-01. Gắn theo dõi tương tác (activity/idle) khi đang `authenticated`.
 */
export function ProtectedRouteV1({ children }: { children: ReactNode }) {
  const { status, endReason } = useSessionV1()
  const location = useLocation()
  useSessionActivityV1()

  if (status === 'unknown') return null
  if (status === 'locked') return <Navigate to={lockedPathFor(location)} replace />
  if (status !== 'authenticated') return <Navigate to={loginPathFor(location, endReason)} replace />
  return <>{children}</>
}
