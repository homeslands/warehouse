import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { useLogoutAll } from '../api/useLogoutAll'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogoutAllDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation(['auth', 'common'])
  const logoutAll = useLogoutAll()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('auth:logoutAll.title')}</DialogTitle>
          <DialogDescription>{t('auth:logoutAll.confirm')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={logoutAll.isPending}
            onClick={() => logoutAll.mutate()}
          >
            {logoutAll.isPending ? t('auth:logoutAll.submitting') : t('auth:logoutAll.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
