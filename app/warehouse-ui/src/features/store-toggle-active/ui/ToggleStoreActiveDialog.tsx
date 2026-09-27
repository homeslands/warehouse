import { useState } from 'react'
import { PowerIcon, PowerOffIcon } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import type { Store } from '@/entities/store'

type Props = {
  /** `null` = đóng. Bản ghi đang được hỏi; hướng suy ra từ `isActive` của chính nó. */
  store: Store | null
  onOpenChange: (open: boolean) => void
  onConfirm: (store: Store) => void
  isPending: boolean
}

/**
 * Hỏi trước khi ngừng/mở hoạt động. Một hộp lo CẢ HAI chiều: hướng lấy từ `store.isActive`, nên
 * trang không phải giữ hai mẩu state riêng. Chiều ngừng là hành động phá huỷ (tông đỏ), chiều mở
 * lại thì không (tông mặc định).
 */
export function ToggleStoreActiveDialog({ store, onOpenChange, onConfirm, isPending }: Props) {
  const { t } = useTranslation(['stores', 'common'])
  // Đóng hộp = trang đặt về null, nhưng hộp còn mờ dần thêm một nhịp. Giữ bản ghi cuối để lúc đó
  // không hiện câu xác nhận với tên trống — và để chữ không nhảy sang chiều ngược lại.
  const [last, setLast] = useState(store)
  if (store !== null && store !== last) setLast(store)
  const shown = store ?? last
  const deactivating = shown?.isActive ?? true

  return (
    <ConfirmDialog
      open={store !== null}
      onOpenChange={onOpenChange}
      tone={deactivating ? 'destructive' : 'success'}
      icon={deactivating ? <PowerOffIcon /> : <PowerIcon />}
      title={t(deactivating ? 'stores:deactivateTitle' : 'stores:activateTitle')}
      description={
        <Trans
          ns={['stores', 'common']}
          i18nKey={deactivating ? 'stores:deactivateConfirm' : 'stores:activateConfirm'}
          values={{ name: shown?.name ?? '' }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      confirmLabel={
        isPending
          ? t('common:saving')
          : t(deactivating ? 'stores:deactivateAction' : 'stores:activateAction')
      }
      isPending={isPending}
      onConfirm={() => store && onConfirm(store)}
    />
  )
}
