import { useState } from 'react'
import { PowerIcon, PowerOffIcon } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import type { Warehouse } from '@/entities/warehouse'

type Props = {
  /** `null` = đóng. Bản ghi đang được hỏi; hướng suy ra từ `isActive` của chính nó. */
  warehouse: Warehouse | null
  onOpenChange: (open: boolean) => void
  onConfirm: (warehouse: Warehouse) => void
  isPending: boolean
}

/**
 * Hỏi trước khi ngừng/mở hoạt động. Một hộp lo CẢ HAI chiều: hướng lấy từ `warehouse.isActive`, nên
 * trang không phải giữ hai mẩu state riêng. Chiều ngừng là hành động phá huỷ (tông đỏ), chiều mở
 * lại thì không (tông mặc định).
 */
export function ToggleWarehouseActiveDialog({
  warehouse,
  onOpenChange,
  onConfirm,
  isPending,
}: Props) {
  const { t } = useTranslation(['warehouses', 'common'])
  // Đóng hộp = trang đặt về null, nhưng hộp còn mờ dần thêm một nhịp. Giữ bản ghi cuối để lúc đó
  // không hiện câu xác nhận với tên trống — và để chữ không nhảy sang chiều ngược lại.
  const [last, setLast] = useState(warehouse)
  if (warehouse !== null && warehouse !== last) setLast(warehouse)
  const shown = warehouse ?? last
  const deactivating = shown?.isActive ?? true

  return (
    <ConfirmDialog
      open={warehouse !== null}
      onOpenChange={onOpenChange}
      tone={deactivating ? 'destructive' : 'success'}
      icon={deactivating ? <PowerOffIcon /> : <PowerIcon />}
      title={t(deactivating ? 'warehouses:deactivateTitle' : 'warehouses:activateTitle')}
      description={
        <Trans
          ns={['warehouses', 'common']}
          i18nKey={deactivating ? 'warehouses:deactivateConfirm' : 'warehouses:activateConfirm'}
          values={{ name: shown?.name ?? '' }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      confirmLabel={
        isPending
          ? t('common:saving')
          : t(deactivating ? 'warehouses:deactivateAction' : 'warehouses:activateAction')
      }
      isPending={isPending}
      onConfirm={() => warehouse && onConfirm(warehouse)}
    />
  )
}
