import { useQueryClient } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { toastApiError } from '@/shared/lib/toast-error'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import {
  exportFormKeys,
  isStaleExportFormError,
  useDeleteExportForm,
  type ExportForm,
} from '@/entities/export-form'

type Props = {
  warehouseSlug: string
  /** `null` = đóng. */
  form: ExportForm | null
  onOpenChange: (open: boolean) => void
  /** Trang chi tiết truyền vào để quay về danh sách sau khi xoá. */
  onDeleted?: () => void
}

export function DeleteExportFormDialog({ warehouseSlug, form, onOpenChange, onDeleted }: Props) {
  const { t } = useTranslation(['exportForms', 'common'])
  const qc = useQueryClient()
  const remove = useDeleteExportForm()
  // Giữ bản ghi cuối để lúc hộp mờ dần không hiện câu với mã trống.
  const [last, setLast] = useState(form)
  if (form !== null && form !== last) setLast(form)
  const shown = form ?? last

  const onConfirm = () => {
    if (!form) return
    remove.mutate(
      { warehouseSlug, slug: form.slug },
      {
        // Hook đã gỡ cache chi tiết và làm mới danh sách; phiếu nháp chưa giữ hàng nên không đụng tồn.
        onSuccess: () => {
          onDeleted?.()
          onOpenChange(false)
        },
        onError: (error) => {
          if (isStaleExportFormError(error)) {
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
      icon={<Trash2Icon />}
      title={t('exportForms:deleteTitle', { code: shown?.code ?? '' })}
      description={t('exportForms:deleteDescription', { code: shown?.code ?? '' })}
      confirmLabel={remove.isPending ? t('exportForms:deleting') : t('exportForms:deleteAction')}
      isPending={remove.isPending}
      onConfirm={onConfirm}
    />
  )
}
