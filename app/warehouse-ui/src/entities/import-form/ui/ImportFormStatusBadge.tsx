import { useTranslation } from 'react-i18next'
import { StatusIndicator, type StatusTone } from '@/shared/ui/StatusIndicator'
import type { ImportFormStatus } from '../model/types'

const TONE: Record<ImportFormStatus, StatusTone> = {
  DRAFT: 'info',
  CONFIRMED: 'success',
  CANCELLED: 'neutral',
}

/** Dùng chung cho cột trạng thái, header trang chi tiết và bản in. */
export function ImportFormStatusBadge({ status }: { status: ImportFormStatus }) {
  const { t } = useTranslation(['importForms'])
  return <StatusIndicator tone={TONE[status]}>{t(`importForms:status.${status}`)}</StatusIndicator>
}
