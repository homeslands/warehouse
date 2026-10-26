import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import type { ExportFormValues } from '../model/export-form-editor.schema'

type ExportFormInfoSummaryProps = {
  values: Pick<ExportFormValues, 'type' | 'receiver' | 'purchaseOrder'>
  onEdit: () => void
  disabled?: boolean
}

/** Một dòng tóm tắt bước ① (lý do · người nhận · PO) ở đầu bước ②, kèm nút quay lại sửa. */
export function ExportFormInfoSummary({ values, onEdit, disabled }: ExportFormInfoSummaryProps) {
  const { t } = useTranslation(['exportForms'])
  return (
    <div className="bg-muted/60 flex items-start justify-between gap-3 rounded-xl px-4 py-2.5 text-sm">
      <p className="min-w-0 font-medium break-words">
        {t('exportForms:infoSummary', {
          type: t(`exportForms:type.${values.type}`),
          receiver: values.receiver.trim(),
          po: values.purchaseOrder.trim(),
        })}
      </p>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto shrink-0 p-0"
        disabled={disabled}
        onClick={onEdit}
      >
        {t('exportForms:editInfo')}
      </Button>
    </div>
  )
}
