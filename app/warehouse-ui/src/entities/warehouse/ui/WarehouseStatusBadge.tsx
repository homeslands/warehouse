import { useTranslation } from 'react-i18next'
import { Badge } from '@/shared/ui/badge'

/** Dùng chung cho cột trạng thái của bảng và header trang chi tiết. */
export function WarehouseStatusBadge({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation(['warehouses'])
  return (
    <Badge variant={isActive ? 'success' : 'destructive'}>
      {isActive ? t('warehouses:active') : t('warehouses:inactive')}
    </Badge>
  )
}
