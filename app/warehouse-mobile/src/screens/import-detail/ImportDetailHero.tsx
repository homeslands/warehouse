import { useTranslation } from 'react-i18next'

import {
  ImportFormStatusPill,
  importStatusTone,
  type ImportForm,
  type ImportFormStatus,
} from '@/entities/import-form'
import { formatFullDate, type FormatLocale } from '@/shared/lib/format'
import { useTheme } from '@/shared/theme/useTheme'
import { DetailCardHero } from '@/shared/ui/compose'
import { Check, Pencil, X, type LucideIcon } from '@/shared/ui/icons'

const STATUS_ICON: Record<ImportFormStatus, LucideIcon> = {
  DRAFT: Pencil,
  CONFIRMED: Check,
  CANCELLED: X,
}

/**
 * Đầu màn xem phiếu = một `DashCard` (`DetailCardHero`): vòng icon tô theo trạng thái + "Phiếu nhập" + viên
 * trạng thái, tên bên bán suy ra (không có thì mờ "Chưa có bên bán"), "Tổng cộng" + tổng tiền của server,
 * dòng phụ "mã phiếu · ngày · n dòng vật tư".
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
  const { colors } = useTheme()
  const tone = importStatusTone(colors, form.status)
  return (
    <DetailCardHero
      testID="import-detail-hero"
      icon={STATUS_ICON[form.status]}
      iconBackground={tone.bg}
      iconColor={tone.fg}
      kind={t('view.kind')}
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
      code={form.code}
      date={formatFullDate(form.date)}
      count={t('view.lineCount', { count: lineCount })}
    />
  )
}
