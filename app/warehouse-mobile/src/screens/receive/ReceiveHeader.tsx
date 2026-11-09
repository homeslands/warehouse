import { Trans, useTranslation } from 'react-i18next'

import { ImportFormStatusPill, type ImportFormStatus } from '@/entities/import-form'
import { formatFullDate } from '@/shared/lib/format'
import { Text } from '@/shared/ui'
import { DetailHero } from '@/shared/ui/compose'

export type ReceiveHeaderProps = {
  supplierName: string | null
  invoiceCode: string
  date: string
  status: ImportFormStatus
  /** Tổng tiền các dòng đang hiện (`linesTotal`). */
  total: number
  /** Số dòng đang hiện. */
  lineCount: number
  locale: 'vi' | 'en'
}

/**
 * Đầu thân màn = `DetailHero` dùng chung: nhãn trạng thái, tên NCC suy ra (không có thì mờ), dòng phụ
 * "HĐ … · ngày", "Tổng cộng" + tổng các dòng đang hiện.
 */
export function ReceiveHeader({
  supplierName,
  invoiceCode,
  date,
  status,
  total,
  lineCount,
  locale,
}: ReceiveHeaderProps) {
  const { t } = useTranslation('importForms')
  return (
    <DetailHero
      testID="receive-hero"
      pills={
        <ImportFormStatusPill
          testID="receive-status"
          status={status}
          label={t(`status.${status}`)}
        />
      }
      title={supplierName ?? t('receive.noSupplier')}
      titleMuted={!supplierName}
      meta={
        <Text muted size={13} numberOfLines={1}>
          <Trans
            t={t}
            i18nKey="receive.invoiceDate"
            values={{ invoice: invoiceCode, date: formatFullDate(date) }}
            components={{
              inv: <Text code muted size={13} />,
              dt: <Text numeric muted size={13} />,
            }}
          />
        </Text>
      }
      totalLabel={t('view.total')}
      total={total}
      locale={locale}
      count={t('view.lineCount', { count: lineCount })}
    />
  )
}
