import { PencilIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { MetaList } from '@/shared/ui/MetaList'
import type { ExportFormValues } from '../model/export-form-editor.schema'

type ExportFormInfoSummaryProps = {
  values: Pick<ExportFormValues, 'type' | 'receiver' | 'purchaseOrder'>
  /** Có → nút "Sửa" căn phải về bước ① (đầu bước ②). Bước ③ không truyền — tiêu đề phần đã có nút riêng. */
  onEdit?: () => void
  disabled?: boolean
}

/** Thông tin bước ① ở đầu bước ②, chỉ để xem (muốn sửa thì bấm bước ① trên dải bước): một dòng meta nhẹ. */
export function ExportFormInfoSummary({ values, onEdit, disabled }: ExportFormInfoSummaryProps) {
  const { t } = useTranslation(['exportForms'])
  return (
    <MetaList
      items={[
        { label: t('exportForms:fieldType'), value: t(`exportForms:type.${values.type}`) },
        { label: t('exportForms:fieldReceiver'), value: values.receiver.trim() },
        { label: t('exportForms:fieldPurchaseOrder'), value: values.purchaseOrder.trim() },
      ]}
      action={
        onEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={t('exportForms:editInfoSection')}
            onClick={onEdit}
          >
            <PencilIcon aria-hidden />
            {t('exportForms:editSection')}
          </Button>
        )
      }
    />
  )
}
