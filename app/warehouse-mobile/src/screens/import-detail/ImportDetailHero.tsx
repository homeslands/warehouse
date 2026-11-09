import { useTranslation } from 'react-i18next'

import { ImportFormStatusPill, type ImportForm } from '@/entities/import-form'
import type { FormatLocale } from '@/shared/lib/format'
import { DetailHero } from '@/shared/ui/compose'

/**
 * Đầu màn xem phiếu = `DetailHero` dùng chung: viên trạng thái, tên bên bán suy ra (không có thì mờ "Chưa
 * có bên bán"), "Tổng cộng" + tổng tiền của server, "n dòng vật tư".
 */
export function ImportDetailHero({
  form,
  supplierName,
  lineCount,
  locale,
}: {
  form: ImportForm
  supplierName: string | null
  lineCount: number
  locale: FormatLocale
}) {
  const { t } = useTranslation('importForms')
  return (
    <DetailHero
      testID="import-detail-hero"
      pills={
        <ImportFormStatusPill
          testID="import-detail-status"
          status={form.status}
          label={t(`status.${form.status}`)}
        />
      }
      title={supplierName ?? t('receive.noSupplier')}
      titleMuted={!supplierName}
      totalLabel={t('view.total')}
      total={form.total}
      locale={locale}
      count={t('view.lineCount', { count: lineCount })}
    />
  )
}
