import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from './auth.store'
import { hasRole } from './permissions'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status)

  if (status === 'loading') return null
  if (status !== 'authenticated') return <Navigate to="/login" replace />
  return <>{children}</>
}

export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)

  if (status === 'loading') return null
  if (status !== 'authenticated') return <Navigate to="/login" replace />
  if (!hasRole(user, ...roles)) return <Navigate to="/forbidden" replace />
  return <>{children}</>
}
