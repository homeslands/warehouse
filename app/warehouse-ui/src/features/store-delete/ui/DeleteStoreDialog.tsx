import { useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import type { Store } from '@/entities/store'

type Props = {
  store: Store | null
  onOpenChange: (open: boolean) => void
  onConfirm: (slug: string) => void
  isPending: boolean
}

/**
 * Backend bắt ngừng hoạt động trước khi xoá (101016). Trang đã khoá mục Xoá với cửa hàng đang
 * hoạt động, hộp này chỉ lo phần xác nhận.
 */
export function DeleteStoreDialog({ store, onOpenChange, onConfirm, isPending }: Props) {
  const { t } = useTranslation(['stores', 'common'])
  // Đóng hộp = trang đặt về null, nhưng hộp còn mờ dần thêm một nhịp. Giữ bản ghi cuối để lúc đó
  // không hiện câu xác nhận với tên trống.
  const [last, setLast] = useState(store)
  if (store !== null && store !== last) setLast(store)
  const shown = store ?? last

  return (
    <ConfirmDialog
      open={store !== null}
      onOpenChange={onOpenChange}
      icon={<Trash2Icon />}
      title={t('stores:delete')}
      description={
        <Trans
          ns={['stores', 'common']}
          i18nKey="stores:deleteConfirm"
          values={{ name: shown?.name ?? '' }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      confirmLabel={isPending ? t('stores:deleting') : t('stores:deleteAction')}
      isPending={isPending}
      onConfirm={() => store && onConfirm(store.slug)}
    />
  )
}
