import { useTranslation } from 'react-i18next'
import { StatusIndicator, type StatusTone } from '@/shared/ui/StatusIndicator'
import type { ImportFormStatus } from '../model/types'

/**
 * Quy ước màu chứng từ của ERP (SAP Fiori / Odoo / NetSuite): nháp = trung tính (chưa có hiệu lực, còn sửa được),
 * đã xác nhận = xanh lá (đã ghi sổ, đã cộng tồn), đã huỷ = đỏ (chứng từ bị vô hiệu).
 */
const TONE: Record<ImportFormStatus, StatusTone> = {
  DRAFT: 'neutral',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
}

/** Dùng chung cho cột trạng thái, header trang chi tiết và bản in. */
export function ImportFormStatusBadge({ status }: { status: ImportFormStatus }) {
  const { t } = useTranslation(['importForms'])
  return <StatusIndicator tone={TONE[status]}>{t(`importForms:status.${status}`)}</StatusIndicator>
}
