import { useTranslation } from 'react-i18next'
import { StatusIndicator } from '@/shared/ui/StatusIndicator'

/** Trạng thái tài khoản. Hiện chỉ đọc — khoá/mở đi hộp riêng (cờ `userStatus`). */
export function UserStatusBadge({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation(['users'])
  return (
    <StatusIndicator tone={isActive ? 'success' : 'neutral'}>
      {isActive ? t('users:active') : t('users:inactive')}
    </StatusIndicator>
  )
}
