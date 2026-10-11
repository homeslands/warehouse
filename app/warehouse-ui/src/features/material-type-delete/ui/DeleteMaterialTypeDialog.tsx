import { useQueryClient } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { toastApiError } from '@/shared/lib/toast-error'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { materialKeys } from '@/entities/material'
import { useDeleteMaterialType, type MaterialType } from '@/entities/material-type'

/** Còn vật tư thuộc loại — backend không trả số đếm nên chỉ biết sau khi gửi. */
const MATERIAL_TYPE_IN_USE = 100609

type Props = {
  /** `null` = đóng. */
  materialType: MaterialType | null
  onOpenChange: (open: boolean) => void
}

/** Lỗi 100609 báo ngay trong hộp, lỗi khác đi toast. */
export function DeleteMaterialTypeDialog({ materialType, onOpenChange }: Props) {
  const { t } = useTranslation(['materialTypes', 'common'])
  const qc = useQueryClient()
  const remove = useDeleteMaterialType()
  const [error, setError] = useState<{ slug: string; message: string } | null>(null)

  // Giữ bản ghi cuối để lúc hộp mờ dần không hiện câu xác nhận với tên trống.
  const [last, setLast] = useState(materialType)
  if (materialType !== null && materialType !== last) setLast(materialType)
  // Đóng hộp = dọn lỗi: mở lại đúng bản ghi đó (vd sau khi đã gỡ hết ràng buộc) không còn câu lỗi cũ.
  if (materialType === null && error !== null) setError(null)
  const shown = materialType ?? last
  // Lỗi gắn với bản ghi nó sinh ra: mở cho loại khác thì không hiện lại.
  const inlineError = error !== null && error.slug === materialType?.slug ? error.message : null

  const confirm = () => {
    if (!materialType) return
    const { slug } = materialType
    setError(null)
    remove.mutate(slug, {
      onSuccess: () => {
        // Bảng / bộ lọc phía vật tư hiện tên loại.
        void qc.invalidateQueries({ queryKey: materialKeys.all })
        onOpenChange(false)
      },
      onError: (err) => {
        if (isApiError(err) && err.code === MATERIAL_TYPE_IN_USE) {
          setError({ slug, message: resolveApiErrorMessage(err) })
          return
        }
        toastApiError(err)
      },
    })
  }

  return (
    <ConfirmDialog
      open={materialType !== null}
      onOpenChange={onOpenChange}
      icon={<Trash2Icon />}
      title={t('materialTypes:delete')}
      description={
        <Trans
          ns={['materialTypes', 'common']}
          i18nKey="materialTypes:deleteConfirm"
          values={{ code: shown?.code ?? '', name: shown?.name ?? '' }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      details={
        inlineError !== null ? (
          <p role="alert" className="text-destructive text-sm">
            {inlineError}
          </p>
        ) : undefined
      }
      confirmLabel={
        remove.isPending ? t('materialTypes:deleting') : t('materialTypes:deleteAction')
      }
      isPending={remove.isPending}
      onConfirm={confirm}
    />
  )
}
