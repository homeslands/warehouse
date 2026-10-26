import { useQueryClient } from '@tanstack/react-query'
import { BanIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { isApiError } from '@/shared/api/http'
import { toastApiError } from '@/shared/lib/toast-error'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import {
  exportFormKeys,
  isStaleExportFormError,
  useCancelExportForm,
  type ExportForm,
} from '@/entities/export-form'
import { inventoryKeys } from '@/entities/inventory'
import { materialBatchKeys } from '@/entities/material-batch'

/** `EXPORT_FORM_CANNOT_BE_CANCELLED` (409) — phiếu đã sang trạng thái không huỷ được. */
const EXPORT_FORM_CANNOT_BE_CANCELLED = 101438

type Props = {
  warehouseSlug: string
  /** `null` = đóng. */
  form: ExportForm | null
  onOpenChange: (open: boolean) => void
}

export function CancelExportFormDialog({ warehouseSlug, form, onOpenChange }: Props) {
  const { t } = useTranslation(['exportForms', 'common'])
  const qc = useQueryClient()
  const action = useCancelExportForm()
  // Giữ bản ghi cuối để lúc hộp mờ dần không hiện câu với mã trống.
  const [last, setLast] = useState(form)
  if (form !== null && form !== last) setLast(form)
  const shown = form ?? last

  const onConfirm = () => {
    if (!form) return
    action.mutate(
      { warehouseSlug, slug: form.slug, version: form.version },
      {
        onSuccess: () => {
          // Huỷ phiếu PENDING trả hàng giữ chỗ → tồn khả dụng và lô đổi.
          void qc.invalidateQueries({ queryKey: inventoryKeys.all })
          void qc.invalidateQueries({ queryKey: materialBatchKeys.warehouse(warehouseSlug) })
          onOpenChange(false)
        },
        onError: (error) => {
          if (
            isStaleExportFormError(error) ||
            (isApiError(error) && error.code === EXPORT_FORM_CANNOT_BE_CANCELLED)
          ) {
            toast.error(t('exportForms:conflict'))
            void qc.invalidateQueries({ queryKey: exportFormKeys.warehouse(warehouseSlug) })
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
      tone="destructive"
      icon={<BanIcon />}
      title={t('exportForms:cancelTitle', { code: shown?.code ?? '' })}
      description={
        shown?.status === 'PENDING'
          ? t('exportForms:cancelDescriptionPending')
          : t('exportForms:cancelDescriptionDraft')
      }
      confirmLabel={action.isPending ? t('exportForms:cancelling') : t('exportForms:cancelAction')}
      isPending={action.isPending}
      onConfirm={onConfirm}
    />
  )
}
