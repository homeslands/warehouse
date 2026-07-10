import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageToggle } from '@/components/layout/LanguageToggle'
import { ModeToggle } from '@/components/layout/ModeToggle'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/shared/auth/auth.store'
import { cn } from '@/shared/lib/cn'

// Menu hiện chỉ có một mục nên chưa cần lọc theo quyền. Khi thêm mục thứ hai
// bị giới hạn quyền, lọc NAV bằng hasRole(user, ...) — không dùng can(), vì
// can() luôn trả false (backend chưa seed authority nào).
const NAV = [{ to: '/examples', labelKey: 'examples:nav' }] as const

export function AppShell() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { pathname } = useLocation()
  const { t } = useTranslation(['common', 'examples'])

  return (
    <div className="bg-background flex min-h-screen">
      <aside className="bg-muted/40 w-56 shrink-0 border-r p-4">
        <div className="mb-6 text-lg font-semibold">{t('common:appName')}</div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'hover:bg-muted block rounded px-3 py-2 text-sm',
                pathname === item.to && 'bg-muted font-medium',
              )}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="text-muted-foreground text-sm">{pathname}</div>
          <div className="flex items-center gap-3">
            <span className="text-sm">
              {user?.userName} <span className="text-muted-foreground">({user?.roleName})</span>
            </span>
            <LanguageToggle />
            <ModeToggle />
            <Button variant="outline" size="sm" onClick={logout}>
              {t('common:logout')}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
