import { useQueryClient } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { toastApiError } from '@/shared/lib/toast-error'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import {
  MATERIAL_IN_USE,
  materialKeys,
  useDeleteMaterial,
  type Material,
} from '@/entities/material'
import { supplierKeys } from '@/entities/supplier'
import { unitKeys } from '@/entities/unit'

type Props = {
  /** `null` = đóng. */
  material: Material | null
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

/** Lỗi 100712 (còn gán vào kho) báo ngay trong hộp, lỗi khác đi toast. */
export function DeleteMaterialDialog({ material, onOpenChange, onDeleted }: Props) {
  const { t } = useTranslation(['materials', 'common'])
  const qc = useQueryClient()
  const remove = useDeleteMaterial()
  const [error, setError] = useState<{ slug: string; message: string } | null>(null)

  // Giữ bản ghi cuối để lúc hộp mờ dần không hiện câu xác nhận với tên trống.
  const [last, setLast] = useState(material)
  if (material !== null && material !== last) setLast(material)
  // Đóng hộp = dọn lỗi: mở lại đúng bản ghi đó (vd sau khi đã gỡ hết ràng buộc) không còn câu lỗi cũ.
  if (material === null && error !== null) setError(null)
  const shown = material ?? last
  // Lỗi gắn với bản ghi nó sinh ra: mở cho vật tư khác thì không hiện lại.
  const inlineError = error !== null && error.slug === material?.slug ? error.message : null

  const confirm = () => {
    if (!material) return
    const { slug } = material
    setError(null)
    remove.mutate(slug, {
      onSuccess: () => {
        // Đếm "đang dùng" của đơn vị + bảng vật tư của nhà cung cấp.
        void qc.invalidateQueries({ queryKey: unitKeys.all })
        void qc.invalidateQueries({ queryKey: supplierKeys.all })
        // Xoá từ màn danh sách (không có trang chi tiết đang mở): gỡ cache chi tiết ngay, để Back / Forward về
        // `/materials/:slug` không hiện lại bản ghi đã xoá. Trang chi tiết (có `onDeleted`) tự gỡ lúc unmount.
        if (!onDeleted) {
          qc.removeQueries({ queryKey: materialKeys.detail(slug) })
          qc.removeQueries({ queryKey: materialKeys.conversions(slug) })
        }
        onDeleted?.()
        onOpenChange(false)
      },
      onError: (err) => {
        if (isApiError(err) && err.code === MATERIAL_IN_USE) {
          setError({ slug, message: resolveApiErrorMessage(err) })
          return
        }
        toastApiError(err)
      },
    })
  }

  return (
    <ConfirmDialog
      open={material !== null}
      onOpenChange={onOpenChange}
      icon={<Trash2Icon />}
      title={t('materials:delete')}
      description={
        <Trans
          ns={['materials', 'common']}
          i18nKey="materials:deleteConfirm"
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
      confirmLabel={remove.isPending ? t('materials:deleting') : t('materials:deleteAction')}
      isPending={remove.isPending}
      onConfirm={confirm}
    />
  )
}
