import { useTranslation } from 'react-i18next'
import { formatDate } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'

type ImportFormInfoSummaryProps = {
  seller?: string
  invoiceCode: string
  date: string
  onEdit: () => void
  disabled?: boolean
}

/** Một dòng tóm tắt bước ① (bên bán · hoá đơn · ngày) ở đầu bước ②, kèm nút quay lại sửa. */
export function ImportFormInfoSummary({
  seller,
  invoiceCode,
  date,
  onEdit,
  disabled,
}: ImportFormInfoSummaryProps) {
  const { t } = useTranslation(['importForms'])
  const params = { invoice: invoiceCode.trim(), date: formatDate(date) }
  return (
    <div className="bg-muted/60 flex items-start justify-between gap-3 rounded-xl px-4 py-2.5 text-sm">
      <p className="min-w-0 font-medium break-words">
        {seller
          ? t('importForms:infoSummary', { ...params, seller })
          : t('importForms:infoSummaryNoSeller', params)}
      </p>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto shrink-0 p-0"
        disabled={disabled}
        onClick={onEdit}
      >
        {t('importForms:editInfo')}
      </Button>
    </div>
  )
}
