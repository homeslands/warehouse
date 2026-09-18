import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import type { Example } from '@/entities/example'

type Props = {
  example: Example | null
  onOpenChange: (open: boolean) => void
  onConfirm: (slug: string) => void
  isPending: boolean
}

export function DeleteExampleDialog({ example, onOpenChange, onConfirm, isPending }: Props) {
  const { t } = useTranslation(['examples', 'common'])
  // Đóng hộp = trang đặt example về null, nhưng hộp còn mờ dần thêm một nhịp. Giữ example cuối cùng
  // để lúc đó không hiện "Xoá ?" với tên trống.
  const [lastExample, setLastExample] = useState(example)
  if (example !== null && example !== lastExample) setLastExample(example)
  const shown = example ?? lastExample

  return (
    <AlertDialog open={example !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('examples:delete')}</AlertDialogTitle>
          <AlertDialogDescription>
            <Trans
              ns={['examples', 'common']}
              i18nKey="examples:deleteConfirm"
              values={{ name: shown?.name ?? '' }}
              components={[<span key="0" />, <span key="1" className="font-medium" />]}
            />
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={(event) => {
              // Action của Radix tự đóng hộp ngay khi bấm. Giữ hộp mở tới khi xoá xong (trang đóng
              // qua onSuccess) để lỗi không làm hộp biến mất như thể đã xoá được.
              event.preventDefault()
              if (example) onConfirm(example.slug)
            }}
          >
            {isPending ? t('examples:deleting') : t('examples:deleteAction')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
