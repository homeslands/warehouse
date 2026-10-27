import { useTranslation } from 'react-i18next'
import { StatusIndicator, type StatusTone } from '@/shared/ui/StatusIndicator'
import type { ExportFormStatus } from '../model/types'

/**
 * Nháp = trung tính (chưa có hiệu lực), chờ duyệt = vàng (đã giữ chỗ tồn, đang đợi xử lý),
 * đã xác nhận = xanh lá (đã trừ tồn), đã huỷ = đỏ (chứng từ bị vô hiệu).
 */
const TONE: Record<ExportFormStatus, StatusTone> = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
}

/** Dùng chung cho cột trạng thái, header trang chi tiết và bản in. */
export function ExportFormStatusBadge({ status }: { status: ExportFormStatus }) {
  const { t } = useTranslation(['exportForms'])
  return <StatusIndicator tone={TONE[status]}>{t(`exportForms:status.${status}`)}</StatusIndicator>
}
