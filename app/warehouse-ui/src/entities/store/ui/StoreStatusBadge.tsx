import { useTranslation } from 'react-i18next'
import { Badge } from '@/shared/ui/badge'

/** Dùng chung cho cột trạng thái của bảng và header trang chi tiết. */
export function StoreStatusBadge({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation(['stores'])
  return (
    <Badge variant={isActive ? 'success' : 'destructive'}>
      {isActive ? t('stores:active') : t('stores:inactive')}
    </Badge>
  )
}
