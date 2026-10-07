import { useTranslation } from 'react-i18next'
import { StatusIndicator } from '@/shared/ui/StatusIndicator'

/** Dùng chung cho cột trạng thái của bảng và header trang chi tiết. */
export function WarehouseStatusBadge({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation(['warehouses'])
  return (
    <StatusIndicator tone={isActive ? 'success' : 'neutral'}>
      {isActive ? t('warehouses:active') : t('warehouses:inactive')}
    </StatusIndicator>
  )
}
