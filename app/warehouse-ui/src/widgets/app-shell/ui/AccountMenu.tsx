import { ChevronDown, LogOutIcon, UserIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuthStore, useRoleLabel } from '@/entities/session'
import { ChangePasswordDialog } from '@/features/change-password'
import { LogoutAllDialog } from '@/features/logout-all'
import { formatFullName, initialsOf } from '@/shared/lib/person-name'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  const roleLabel = useRoleLabel()

  // Tên hiển thị: họ tên nếu đã khai, không thì "Người dùng" — số điện thoại không phải tên, nó nằm ở
  // dòng phụ trong menu.
  const fullName = user ? formatFullName(user) : ''
  const displayName = fullName || t('common:unnamedUser')
  const role = roleLabel(user?.roleName)
  const loginId = user?.phonenumber || user?.userName
  const contact = [loginId, user?.email].filter(Boolean).join(' · ')

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Màn hẹp chỉ còn ảnh đại diện — tên + vai trò sẽ chiếm hết header. Tên khả truy cập luôn đủ. */}
          <Button
            variant="ghost"
            className="h-12 gap-2.5 px-2 sm:pr-3"
            aria-label={`${displayName} (${role})`}
          >
            <Avatar name={fullName} />
            {/* `text-sm/5` + `text-xs/4`: line-height của thang chữ (đã nâng ~14%) làm hai dòng chạm mép nền hover. */}
            <span className="hidden min-w-0 flex-col items-start gap-0.5 sm:flex">
              <span className="max-w-40 truncate text-sm/5 font-medium">{displayName}</span>
              <span className="text-muted-foreground text-xs/4 font-normal">{role}</span>
            </span>
            <ChevronDown aria-hidden className="hidden sm:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-72">
          {/* Hai dòng, không ba: tên + vai trò (nhãn nhỏ) cùng hàng, thông tin liên hệ gộp một dòng xám. */}
          <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
            <Avatar name={fullName} className="size-9 text-xs" />
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-foreground truncate text-sm/5 font-semibold">
                  {displayName}
                </span>
                <Badge variant="secondary" className="h-5 px-3 py-1">
                  {role}
                </Badge>
              </span>
              {contact && (
                <span className="text-muted-foreground truncate text-xs/4">{contact}</span>
              )}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
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

/** Ảnh đại diện tạm bằng chữ viết tắt của họ tên — backend chưa có ảnh. Chưa có tên → icon người. */
function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        className,
      )}
    >
      {name ? initialsOf(name) : <UserIcon className="size-1/2" />}
    </span>
  )
}
