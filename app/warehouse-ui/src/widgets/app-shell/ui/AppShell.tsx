import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router-dom'
import { LanguageToggle } from '@/features/language-switch'
import { ModeToggle } from '@/features/theme-toggle'
import type { NavGroup } from '@/shared/lib/nav'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar'
import { readSidebarOpenCookie } from '../lib/sidebar-cookie'
import { useDocumentTitle } from '../model/crumbs'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { AccountMenu } from './AccountMenu'
import { AppBreadcrumb } from './AppBreadcrumb'
import { AppSidebar } from './AppSidebar'
import { RouteProgress } from './RouteProgress'

type Props = {
  /** Menu đã lọc theo quyền — tầng app dựng từ `handle` của route (widget không import app). */
  nav: NavGroup[]
}

export function AppShell({ nav }: Props) {
  const { t } = useTranslation(['nav'])
  // Đọc cookie một lần lúc mount: F5 giữ trạng thái thu gọn/mở. Sau đó SidebarProvider tự ghi.
  const [defaultOpen] = useState(readSidebarOpenCookie)
  useDocumentTitle()

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar nav={nav} />

        <SidebarInset>
          <header className="bg-background sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4">
            {/* Ctrl/⌘ + B cũng bật/tắt (SidebarProvider tự bắt phím). */}
            <SidebarTrigger aria-label={t('nav:toggleSidebar')} />
            <div className="min-w-0 flex-1">
              <AppBreadcrumb />
            </div>
            <div className="flex items-center gap-3">
              <LanguageToggle />
              <ModeToggle />
              <AccountMenu />
            </div>
          </header>

          {/* SidebarInset là <div>: <main> chỉ bọc vùng nội dung, header (banner) nằm ngoài. */}
          <main className="relative flex-1 p-6">
            <RouteProgress />
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
