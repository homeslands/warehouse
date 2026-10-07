import { LockIcon, LockOpenIcon } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { userDisplayName, type User } from '@/entities/user'

type Props = {
  /** `null` = đóng. Hướng (khoá / mở) suy ra từ `isActive` của chính bản ghi. */
  user: User | null
  onOpenChange: (open: boolean) => void
  onConfirm: (user: User) => void
  isPending: boolean
}

/**
 * Khoá / mở khoá (`PUT /users/{slug}/lock|unlock`). Một hộp lo cả hai chiều theo quy ước
 * `features/<x>-toggle-active`. Chiều khoá phá huỷ (đăng xuất mọi thiết bị) nên bắt gõ tên đăng nhập.
 */
export function ToggleUserActiveDialog({ user, onOpenChange, onConfirm, isPending }: Props) {
  const { t } = useTranslation(['users', 'common'])
  // Giữ bản ghi cuối khi hộp đang mờ dần — chữ không nhảy chiều, không mất tên.
  const [last, setLast] = useState(user)
  if (user !== null && user !== last) setLast(user)
  const shown = user ?? last
  const locking = shown?.isActive ?? true

  return (
    <ConfirmDialog
      open={user !== null}
      onOpenChange={onOpenChange}
      tone={locking ? 'destructive' : 'success'}
      icon={locking ? <LockIcon /> : <LockOpenIcon />}
      title={t(locking ? 'users:lockTitle' : 'users:unlockTitle')}
      description={
        <Trans
          ns={['users', 'common']}
          i18nKey={locking ? 'users:lockConfirm' : 'users:unlockConfirm'}
          values={{ name: shown ? userDisplayName(shown) : '' }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      confirmLabel={
        isPending ? t('common:saving') : t(locking ? 'users:lockAction' : 'users:unlockAction')
      }
      confirmPhrase={locking ? shown?.phonenumber : undefined}
      isPending={isPending}
      onConfirm={() => user && onConfirm(user)}
    />
  )
}
