import { useQueryClient } from '@tanstack/react-query'
import { SendIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { toastApiError } from '@/shared/lib/toast-error'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import {
  exportFormKeys,
  isShortageError,
  isStaleExportFormError,
  useSubmitExportForm,
  type ExportForm,
} from '@/entities/export-form'
import { inventoryKeys } from '@/entities/inventory'
import { materialBatchKeys } from '@/entities/material-batch'

type Props = {
  warehouseSlug: string
  /** `null` = đóng. */
  form: ExportForm | null
  onOpenChange: (open: boolean) => void
}

export function SubmitExportFormDialog({ warehouseSlug, form, onOpenChange }: Props) {
  const { t } = useTranslation(['exportForms', 'common'])
  const qc = useQueryClient()
  const action = useSubmitExportForm()
  // Giữ bản ghi cuối để lúc hộp mờ dần không hiện câu với mã trống.
  const [last, setLast] = useState(form)
  if (form !== null && form !== last) setLast(form)
  const shown = form ?? last

  // Giữ chỗ đổi tồn khả dụng và số khả dụng của lô — hai entity khác nên tầng feature tự làm mới.
  const refreshStock = () => {
    void qc.invalidateQueries({ queryKey: exportFormKeys.warehouse(warehouseSlug) })
    void qc.invalidateQueries({ queryKey: inventoryKeys.all })
    void qc.invalidateQueries({ queryKey: materialBatchKeys.warehouse(warehouseSlug) })
  }

  const onConfirm = () => {
    if (!form) return
    action.mutate(
      { warehouseSlug, slug: form.slug, version: form.version },
      {
        onSuccess: () => {
          refreshStock()
          onOpenChange(false)
        },
        onError: (error) => {
          if (isStaleExportFormError(error)) {
            toast.error(t('exportForms:conflict'))
            void qc.invalidateQueries({ queryKey: exportFormKeys.warehouse(warehouseSlug) })
            onOpenChange(false)
            return
          }
          if (isShortageError(error)) {
            toast.error(t('exportForms:submitShortage'), {
              description: resolveApiErrorMessage(error),
            })
            refreshStock()
            onOpenChange(false)
            return
          }
          toastApiError(error)
        },
      },
    )
  }

  return (
    <ConfirmDialog
      open={form !== null}
      onOpenChange={onOpenChange}
      tone="default"
      icon={<SendIcon />}
      title={t('exportForms:submitTitle', { code: shown?.code ?? '' })}
      description={t('exportForms:submitDescription')}
      confirmLabel={action.isPending ? t('exportForms:submitting') : t('exportForms:submitAction')}
      isPending={action.isPending}
      onConfirm={onConfirm}
    />
  )
}
