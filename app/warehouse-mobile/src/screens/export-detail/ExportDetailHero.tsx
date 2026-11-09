import { useTranslation } from 'react-i18next'

import { ExportFormStatusPill, ExportFormTypePill, type ExportForm } from '@/entities/export-form'
import type { FormatLocale } from '@/shared/lib/format'
import { DetailHero } from '@/shared/ui/compose'

/**
 * Đầu màn xem phiếu xuất = `DetailHero` dùng chung: viên trạng thái + viên loại, người nhận làm tiêu đề,
 * "Tổng cộng" + tổng tiền của server, "n dòng" (Chờ duyệt: "n dòng · đã giữ hàng").
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
  return (
    <DetailHero
      testID="export-detail-hero"
      pills={
        <>
          <ExportFormStatusPill testID="export-detail-status" status={form.status} />
          <ExportFormTypePill testID="export-detail-type" type={form.type} />
        </>
      }
      title={form.receiver}
      totalLabel={t('view.total')}
      total={form.totalAmount}
      locale={locale}
      count={t(form.status === 'PENDING' ? 'view.lineCountReserved' : 'view.lineCount', {
        count: lineCount,
      })}
    />
  )
}
