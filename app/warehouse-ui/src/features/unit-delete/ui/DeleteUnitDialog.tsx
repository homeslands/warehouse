import { useQueryClient } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { toastApiError } from '@/shared/lib/toast-error'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { materialKeys } from '@/entities/material'
import { unitKeys, useDeleteUnit, type Unit } from '@/entities/unit'

/** Đơn vị còn được vật tư dùng. Trang đã khoá mục Xoá khi biết, nhưng số đếm có thể cũ. */
const UNIT_IN_USE = 100909

type Props = {
  /** `null` = đóng. */
  unit: Unit | null
  onOpenChange: (open: boolean) => void
}

/** Lỗi 100909 báo ngay trong hộp, lỗi khác đi toast. */
export function DeleteUnitDialog({ unit, onOpenChange }: Props) {
  const { t } = useTranslation(['units', 'common'])
  const qc = useQueryClient()
  const remove = useDeleteUnit()
  const [error, setError] = useState<{ slug: string; message: string } | null>(null)

  // Giữ bản ghi cuối để lúc hộp mờ dần không hiện câu xác nhận với tên trống.
  const [last, setLast] = useState(unit)
  if (unit !== null && unit !== last) setLast(unit)
  // Đóng hộp = dọn lỗi: mở lại đúng bản ghi đó (vd sau khi đã gỡ hết ràng buộc) không còn câu lỗi cũ.
  if (unit === null && error !== null) setError(null)
  const shown = unit ?? last
  // Lỗi gắn với bản ghi nó sinh ra: mở cho đơn vị khác thì không hiện lại.
  const inlineError = error !== null && error.slug === unit?.slug ? error.message : null

  const confirm = () => {
    if (!unit) return
    const { slug } = unit
    setError(null)
    remove.mutate(slug, {
      onSuccess: () => {
        // Hộp quy đổi của vật tư liệt kê đơn vị gắn được (dưới `materialKeys`) — bỏ đơn vị vừa xoá.
        void qc.invalidateQueries({ queryKey: materialKeys.all })
        onOpenChange(false)
      },
      onError: (err) => {
        if (isApiError(err) && err.code === UNIT_IN_USE) {
          // Số "Đang dùng" trên bảng đã cũ — tải lại để mục Xoá tự khoá đúng.
          void qc.invalidateQueries({ queryKey: unitKeys.all })
          setError({ slug, message: resolveApiErrorMessage(err) })
          return
        }
        toastApiError(err)
      },
    })
  }

  return (
    <ConfirmDialog
      open={unit !== null}
      onOpenChange={onOpenChange}
      icon={<Trash2Icon />}
      title={t('units:delete')}
      description={
        <Trans
          ns={['units', 'common']}
          i18nKey="units:deleteConfirm"
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
      confirmLabel={remove.isPending ? t('units:deleting') : t('units:deleteAction')}
      isPending={remove.isPending}
      onConfirm={confirm}
    />
  )
}
