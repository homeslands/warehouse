import { useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { toastApiError } from '@/shared/lib/toast-error'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { useDeleteSupplier, type Supplier } from '@/entities/supplier'

/** Nhà cung cấp còn vật tư đang gắn — gỡ hết ở tab Vật tư rồi mới xoá được. */
const SUPPLIER_HAS_MATERIALS = 101211

type Props = {
  /** `null` = đóng. */
  supplier: Supplier | null
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

/** Hộp tự giữ mutation: lỗi 101211 báo ngay trong hộp, lỗi khác đi toast. */
export function DeleteSupplierDialog({ supplier, onOpenChange, onDeleted }: Props) {
  const { t } = useTranslation(['suppliers', 'common'])
  const remove = useDeleteSupplier()
  const [error, setError] = useState<{ slug: string; message: string } | null>(null)

  // Đóng hộp = trang đặt về null, nhưng hộp còn mờ dần thêm một nhịp. Giữ bản ghi cuối để lúc đó
  // không hiện câu xác nhận với tên trống.
  const [last, setLast] = useState(supplier)
  if (supplier !== null && supplier !== last) setLast(supplier)
  const shown = supplier ?? last

  // Lỗi gắn với bản ghi nó sinh ra: mở cho nhà cung cấp khác thì không hiện lại (render-time).
  const inlineError = error !== null && error.slug === supplier?.slug ? error.message : null

  const confirm = () => {
    if (!supplier) return
    const { slug } = supplier
    setError(null)
    remove.mutate(slug, {
      onSuccess: () => {
        onDeleted?.()
        onOpenChange(false)
      },
      onError: (err) => {
        if (isApiError(err) && err.code === SUPPLIER_HAS_MATERIALS) {
          setError({ slug, message: resolveApiErrorMessage(err) })
          return
        }
        toastApiError(err)
      },
    })
  }

  return (
    <ConfirmDialog
      open={supplier !== null}
      onOpenChange={onOpenChange}
      icon={<Trash2Icon />}
      title={t('suppliers:delete')}
      description={
        <Trans
          ns={['suppliers', 'common']}
          i18nKey="suppliers:deleteConfirm"
          values={{ code: shown?.code ?? '', name: shown?.name ?? '' }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      details={
        inlineError !== null && supplier ? (
          <div role="alert" className="text-destructive text-sm">
            {inlineError}{' '}
            <Link
              to={`/suppliers/${supplier.slug}?tab=materials`}
              className="font-medium underline underline-offset-4"
            >
              {t('suppliers:openMaterialsTab')}
            </Link>
          </div>
        ) : undefined
      }
      confirmLabel={remove.isPending ? t('suppliers:deleting') : t('suppliers:deleteAction')}
      isPending={remove.isPending}
      onConfirm={confirm}
    />
  )
}
