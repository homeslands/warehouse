import { ChevronDown, CircleUserRoundIcon, LogOutIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/entities/session'
import { ChangePasswordDialog } from '@/features/change-password'
import { LogoutAllDialog } from '@/features/logout-all'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
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
  const { t } = useTranslation(['auth', 'common', 'nav', 'account'])
  const [logoutAllOpen, setLogoutAllOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Màn hẹp chỉ còn icon — tên + vai trò dài sẽ chiếm hết header. Tên khả truy cập luôn đủ. */}
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${user?.userName ?? ''} (${user?.roleName ?? ''})`}
          >
            <CircleUserRoundIcon aria-hidden className="sm:hidden" />
            <span className="hidden sm:inline">
              {user?.userName} <span className="text-muted-foreground">({user?.roleName})</span>
            </span>
            <ChevronDown aria-hidden className="hidden sm:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Trang Tài khoản là nơi chứa đầy đủ; menu này chỉ giữ lối tắt cho việc hay dùng. */}
          <DropdownMenuItem asChild>
            <Link to="/account">{t('nav:account')}</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setChangePasswordOpen(true)}>
            {t('auth:account.changePassword')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLogoutAllOpen(true)}>
            {t('auth:account.logoutAll')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setLogoutOpen(true)}>
            {t('common:logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog đặt NGOÀI DropdownMenu: menu đóng lại (unmount nội dung) ngay khi chọn mục. */}
      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        icon={<LogOutIcon />}
        title={t('account:logoutTitle')}
        description={t('account:logoutConfirm')}
        confirmLabel={t('common:logout')}
        onConfirm={() => void logout()}
      />
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <LogoutAllDialog open={logoutAllOpen} onOpenChange={setLogoutAllOpen} />
    </>
  )
}
