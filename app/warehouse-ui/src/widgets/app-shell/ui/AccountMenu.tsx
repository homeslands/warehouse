import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/entities/session'
import { ChangePasswordDialog } from '@/features/change-password'
import { LogoutAllDialog } from '@/features/logout-all'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

export function AccountMenu() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { t } = useTranslation(['auth', 'common'])
  const [logoutAllOpen, setLogoutAllOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            {user?.userName} <span className="text-muted-foreground">({user?.roleName})</span>
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setChangePasswordOpen(true)}>
            {t('auth:account.changePassword')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLogoutAllOpen(true)}>
            {t('auth:account.logoutAll')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void logout()}>{t('common:logout')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog đặt NGOÀI DropdownMenu: menu đóng lại (unmount nội dung) ngay khi chọn mục. */}
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <LogoutAllDialog open={logoutAllOpen} onOpenChange={setLogoutAllOpen} />
    </>
  )
}
