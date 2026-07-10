import { Link, Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/shared/auth/auth.store'
import { cn } from '@/shared/lib/cn'

// Menu hiện chỉ có một mục nên chưa cần lọc theo quyền. Khi thêm mục thứ hai
// bị giới hạn quyền, lọc NAV bằng hasRole(user, ...) — không dùng can(), vì
// can() luôn trả false (backend chưa seed authority nào).
const NAV = [{ to: '/examples', label: 'Examples' }]

export function AppShell() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-slate-50 p-4">
        <div className="mb-6 text-lg font-semibold">Warehouse</div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'block rounded px-3 py-2 text-sm hover:bg-slate-200',
                pathname === item.to && 'bg-slate-200 font-medium',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="text-sm text-slate-500">{pathname}</div>
          <div className="flex items-center gap-3">
            <span className="text-sm">
              {user?.userName} <span className="text-slate-400">({user?.roleName})</span>
            </span>
            <Button variant="outline" size="sm" onClick={logout}>
              Đăng xuất
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
