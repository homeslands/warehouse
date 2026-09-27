import { useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import type { Example } from '@/entities/example'

type Props = {
  example: Example | null
  onOpenChange: (open: boolean) => void
  onConfirm: (slug: string) => void
  isPending: boolean
}

export function DeleteExampleDialog({ example, onOpenChange, onConfirm, isPending }: Props) {
  const { t } = useTranslation(['examples', 'common'])
  // Đóng hộp = trang đặt về null, nhưng hộp còn mờ dần thêm một nhịp. Giữ bản ghi cuối để lúc đó
  // không hiện câu xác nhận với tên trống.
  const [last, setLast] = useState(example)
  if (example !== null && example !== last) setLast(example)
  const shown = example ?? last

  return (
    <ConfirmDialog
      open={example !== null}
      onOpenChange={onOpenChange}
      icon={<Trash2Icon />}
      title={t('examples:delete')}
      description={
        <Trans
          ns={['examples', 'common']}
          i18nKey="examples:deleteConfirm"
          values={{ name: shown?.name ?? '' }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      confirmLabel={isPending ? t('examples:deleting') : t('examples:deleteAction')}
      isPending={isPending}
      onConfirm={() => example && onConfirm(example.slug)}
    />
  )
}
