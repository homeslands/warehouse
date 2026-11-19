import { useTranslation } from 'react-i18next'

import {
  ExportFormStatusPill,
  ExportFormTypePill,
  exportStatusTone,
  type ExportForm,
  type ExportFormStatus,
} from '@/entities/export-form'
import { exportHasPrice } from '@/features/export-draft'
import { formatFullDate, type FormatLocale } from '@/shared/lib/format'
import { useTheme } from '@/shared/theme/useTheme'
import { DetailCardHero } from '@/shared/ui/compose'
import { Check, Clock, Pencil, X, type LucideIcon } from '@/shared/ui/icons'

const STATUS_ICON: Record<ExportFormStatus, LucideIcon> = {
  DRAFT: Pencil,
  PENDING: Clock,
  CONFIRMED: Check,
  CANCELLED: X,
}

/**
 * Đầu màn xem phiếu xuất = một `DashCard` (`DetailCardHero`): vòng icon tô theo trạng thái + "Phiếu xuất" +
 * viên trạng thái / loại, người nhận làm tiêu đề, "Tổng cộng" + tổng tiền của server, dòng phụ "mã phiếu ·
 * ngày · n dòng" (Chờ duyệt: "n dòng · đã giữ hàng").
 */
export function ExportDetailHero({
  form,
  lineCount,
  locale,
}: {
  form: ExportForm
  lineCount: number
  locale: FormatLocale
}) {
  const { t } = useTranslation('exportForms')
  const { colors } = useTheme()
  const tone = exportStatusTone(colors, form.status)
  return (
    <DetailCardHero
      testID="export-detail-hero"
      icon={STATUS_ICON[form.status]}
      iconBackground={tone.bg}
      iconColor={tone.fg}
      kind={t('view.kind')}
      pills={
        <>
          <ExportFormStatusPill testID="export-detail-status" status={form.status} />
          <ExportFormTypePill testID="export-detail-type" type={form.type} />
        </>
      }
      title={form.receiver}
      totalLabel={t('view.total')}
      // Chỉ phiếu Bán có đơn giá (như web) → loại khác không có Tổng cộng.
      total={exportHasPrice(form.type) ? form.totalAmount : null}
      locale={locale}
      code={form.code}
      date={formatFullDate(form.createdAt)}
      count={t(form.status === 'PENDING' ? 'view.lineCountReserved' : 'view.lineCount', {
        count: lineCount,
      })}
    />
  )
}
