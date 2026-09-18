import { House, Warehouse, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { isNavActive, useNavLabel, type NavGroup } from '@/shared/lib/nav'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shared/ui/sidebar'
import { useSidebar } from '@/shared/ui/sidebar-context'

type NavLinkItemProps = {
  to: string
  label: string
  icon: LucideIcon
  active: boolean
  onNavigate: () => void
}

function NavLinkItem({ to, label, icon: Icon, active, onNavigate }: NavLinkItemProps) {
  return (
    <SidebarMenuItem>
      {/* tooltip chỉ hiện khi sidebar thu gọn thành cột icon (SidebarMenuButton tự ẩn khi mở). */}
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        <Link to={to} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
          <Icon aria-hidden />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar({ nav }: { nav: NavGroup[] }) {
  const { t } = useTranslation(['common', 'nav'])
  const label = useNavLabel()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()

  // Trên mobile sidebar là ngăn trượt: chọn mục xong thì đóng lại.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar
      collapsible="icon"
      mobileTitle={t('nav:mainMenu')}
      mobileDescription={t('nav:mainMenuDescription')}
    >
      <SidebarHeader>
        <div className="flex h-8 items-center gap-2 px-2 font-semibold">
          <Warehouse className="size-4 shrink-0" aria-hidden />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {t('common:appName')}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label={t('nav:mainMenu')} className="flex flex-col">
          {/* "Tổng quan" cố định, không thuộc nhóm; chỉ sáng khi đúng "/". */}
          <SidebarGroup>
            <SidebarMenu>
              <NavLinkItem
                to="/"
                label={t('nav:home')}
                icon={House}
                active={pathname === '/'}
                onNavigate={closeOnMobile}
              />
            </SidebarMenu>
          </SidebarGroup>

          {nav.map((group) => (
            <SidebarGroup
              key={group.key}
              role="group"
              aria-labelledby={`sidebar-group-${group.key}`}
            >
              <SidebarGroupLabel id={`sidebar-group-${group.key}`}>
                {label(group.labelKey)}
              </SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavLinkItem
                    key={item.to}
                    to={item.to}
                    label={label(item.labelKey)}
                    icon={item.icon}
                    active={isNavActive(pathname, item.to)}
                    onNavigate={closeOnMobile}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
    </Sidebar>
  )
}
