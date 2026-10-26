import { useQueryClient } from '@tanstack/react-query'
import { BanIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { toastApiError } from '@/shared/lib/toast-error'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import {
  importFormKeys,
  isStaleImportFormError,
  useCancelImportForm,
  type ImportForm,
} from '@/entities/import-form'

type Props = {
  warehouseSlug: string
  /** `null` = đóng. */
  form: ImportForm | null
  onOpenChange: (open: boolean) => void
}

export function CancelImportFormDialog({ warehouseSlug, form, onOpenChange }: Props) {
  const { t } = useTranslation(['importForms', 'common'])
  const qc = useQueryClient()
  const action = useCancelImportForm()
  // Giữ bản ghi cuối để lúc hộp mờ dần không hiện câu với mã trống.
  const [last, setLast] = useState(form)
  if (form !== null && form !== last) setLast(form)
  const shown = form ?? last

  const onConfirm = () => {
    if (!form) return
    action.mutate(
      { warehouseSlug, slug: form.slug, version: form.version },
      {
        onSuccess: () => onOpenChange(false),
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
      tone="destructive"
      icon={<BanIcon />}
      title={t('importForms:cancelTitle', { code: shown?.code ?? '' })}
      description={t('importForms:cancelDescription')}
      confirmLabel={action.isPending ? t('importForms:cancelling') : t('importForms:cancelAction')}
      isPending={action.isPending}
      onConfirm={onConfirm}
    />
  )
}
