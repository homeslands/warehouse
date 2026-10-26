import { useQueryClient } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { toastApiError } from '@/shared/lib/toast-error'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import {
  importFormKeys,
  isStaleImportFormError,
  useDeleteImportForm,
  type ImportForm,
} from '@/entities/import-form'

type Props = {
  warehouseSlug: string
  /** `null` = đóng. */
  form: ImportForm | null
  onOpenChange: (open: boolean) => void
  /** Trang chi tiết truyền vào để quay về danh sách sau khi xoá. */
  onDeleted?: () => void
}

export function DeleteImportFormDialog({ warehouseSlug, form, onOpenChange, onDeleted }: Props) {
  const { t } = useTranslation(['importForms', 'common'])
  const qc = useQueryClient()
  const remove = useDeleteImportForm()
  // Giữ bản ghi cuối để lúc hộp mờ dần không hiện câu với mã trống.
  const [last, setLast] = useState(form)
  if (form !== null && form !== last) setLast(form)
  const shown = form ?? last

  const onConfirm = () => {
    if (!form) return
    const { slug } = form
    remove.mutate(
      { warehouseSlug, slug },
      {
        onSuccess: () => {
          // Xoá từ danh sách: gỡ cache chi tiết ngay để Back không hiện lại phiếu đã xoá.
          if (!onDeleted) qc.removeQueries({ queryKey: importFormKeys.detail(warehouseSlug, slug) })
          onDeleted?.()
          onOpenChange(false)
        },
        onError: (error) => {
          if (isStaleImportFormError(error)) {
            toast.error(t('importForms:conflict'))
            void qc.invalidateQueries({ queryKey: importFormKeys.warehouse(warehouseSlug) })
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
      title={t('importForms:deleteTitle', { code: shown?.code ?? '' })}
      description={t('importForms:deleteDescription', { code: shown?.code ?? '' })}
      confirmLabel={remove.isPending ? t('importForms:deleting') : t('importForms:deleteAction')}
      isPending={remove.isPending}
      onConfirm={onConfirm}
    />
  )
}
