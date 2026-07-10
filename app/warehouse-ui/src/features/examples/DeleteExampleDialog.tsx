import { Trans, useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Example } from './api'

type Props = {
  example: Example | null
  onOpenChange: (open: boolean) => void
  onConfirm: (slug: string) => void
  isPending: boolean
}

export function DeleteExampleDialog({ example, onOpenChange, onConfirm, isPending }: Props) {
  const { t } = useTranslation(['examples', 'common'])

  return (
    <Dialog open={example !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('examples:delete')}</DialogTitle>
        </DialogHeader>

        <p className="text-sm">
          <Trans
            ns={['examples', 'common']}
            i18nKey="examples:deleteConfirm"
            values={{ name: example?.name ?? '' }}
            components={[<span key="0" />, <span key="1" className="font-medium" />]}
          />
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => example && onConfirm(example.slug)}
          >
            {isPending ? t('examples:deleting') : t('examples:deleteAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
