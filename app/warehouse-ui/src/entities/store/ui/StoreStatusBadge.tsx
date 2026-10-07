import { useTranslation } from 'react-i18next'
import { StatusIndicator } from '@/shared/ui/StatusIndicator'

/** Dùng chung cho cột trạng thái của bảng và header trang chi tiết. */
export function StoreStatusBadge({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation(['stores'])
  return (
    <StatusIndicator tone={isActive ? 'success' : 'neutral'}>
      {isActive ? t('stores:active') : t('stores:inactive')}
    </StatusIndicator>
  )
}
