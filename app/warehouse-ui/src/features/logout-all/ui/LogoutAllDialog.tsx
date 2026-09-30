import { LogOutIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { useLogoutAll } from '../api/useLogoutAll'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogoutAllDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation(['auth', 'common'])
  const logoutAll = useLogoutAll()

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<LogOutIcon />}
      title={t('auth:logoutAll.title')}
      description={t('auth:logoutAll.confirm')}
      confirmLabel={
        logoutAll.isPending ? t('auth:logoutAll.submitting') : t('auth:logoutAll.submit')
      }
      isPending={logoutAll.isPending}
      onConfirm={() => logoutAll.mutate()}
    />
  )
}
