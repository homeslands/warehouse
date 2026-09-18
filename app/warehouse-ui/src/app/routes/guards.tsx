import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/entities/session'
import { loginPathFor } from './login-path'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const endReason = useAuthStore((s) => s.endReason)
  const location = useLocation()

  if (status === 'loading') return null
  if (status !== 'authenticated') return <Navigate to={loginPathFor(location, endReason)} replace />
  return <>{children}</>
}
