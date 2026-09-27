import { useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import type { Warehouse } from '@/entities/warehouse'

type Props = {
  warehouse: Warehouse | null
  onOpenChange: (open: boolean) => void
  onConfirm: (slug: string) => void
  isPending: boolean
}

/**
 * Backend bắt ngừng hoạt động trước khi xoá (100517). Trang đã khoá mục Xoá với kho đang hoạt
 * động, hộp này chỉ lo phần xác nhận.
 */
export function DeleteWarehouseDialog({ warehouse, onOpenChange, onConfirm, isPending }: Props) {
  const { t } = useTranslation(['warehouses', 'common'])
  // Đóng hộp = trang đặt về null, nhưng hộp còn mờ dần thêm một nhịp. Giữ bản ghi cuối để lúc đó
  // không hiện câu xác nhận với tên trống.
  const [last, setLast] = useState(warehouse)
  if (warehouse !== null && warehouse !== last) setLast(warehouse)
  const shown = warehouse ?? last

  return (
    <ConfirmDialog
      open={warehouse !== null}
      onOpenChange={onOpenChange}
      icon={<Trash2Icon />}
      title={t('warehouses:delete')}
      description={
        <Trans
          ns={['warehouses', 'common']}
          i18nKey="warehouses:deleteConfirm"
          values={{ name: shown?.name ?? '' }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      confirmLabel={isPending ? t('warehouses:deleting') : t('warehouses:deleteAction')}
      isPending={isPending}
      onConfirm={() => warehouse && onConfirm(warehouse.slug)}
    />
  )
}
