import { useMemo } from 'react'
import type { RouteObject } from 'react-router-dom'
import { useAuthStore } from '@/entities/session'
import { AppShell } from '@/widgets/app-shell'
import { buildNav } from './nav'
import { NavContext } from './nav-context'

/** Layout chính: dựng menu từ chính các route màn hình rồi đưa cho AppShell (widget không import app). */
export function AppLayout({ screens }: { screens: RouteObject[] }) {
  const user = useAuthStore((s) => s.user)
  const nav = useMemo(() => buildNav(screens, user), [screens, user])
  return (
    <NavContext value={nav}>
      <AppShell nav={nav} />
    </NavContext>
  )
}
