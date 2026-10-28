import { PencilIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { formatDate } from '@/shared/lib/format'
import { MetaList } from '@/shared/ui/MetaList'

type ImportFormInfoSummaryProps = {
  seller?: string
  invoiceCode: string
  date: string
  purchaseOrder?: string
  /** Có → nút "Sửa" căn phải về bước ① (đầu bước ②). Bước ③ không truyền — tiêu đề phần đã có nút riêng. */
  onEdit?: () => void
  disabled?: boolean
}

/**
 * Thông tin bước ① ở đầu bước ② (bên bán · số hoá đơn · ngày nhập · số PO), chỉ để xem — muốn sửa thì bấm bước ①
 * trên dải bước. Một dòng meta nhẹ giống phiếu xuất.
 */
export function ImportFormInfoSummary({
  seller,
  invoiceCode,
  date,
  purchaseOrder,
  onEdit,
  disabled,
}: ImportFormInfoSummaryProps) {
  const { t } = useTranslation(['importForms'])
  const po = purchaseOrder?.trim()
  return (
    <MetaList
      items={[
        ...(seller ? [{ label: t('importForms:reviewSeller'), value: seller }] : []),
        { label: t('importForms:fieldInvoiceCode'), value: invoiceCode.trim() },
        { label: t('importForms:fieldDate'), value: formatDate(date) },
        ...(po ? [{ label: t('importForms:fieldPurchaseOrderShort'), value: po }] : []),
      ]}
      action={
        onEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={t('importForms:editInfoSection')}
            onClick={onEdit}
          >
            <PencilIcon aria-hidden />
            {t('importForms:editSection')}
          </Button>
        )
      }
    />
  )
}
