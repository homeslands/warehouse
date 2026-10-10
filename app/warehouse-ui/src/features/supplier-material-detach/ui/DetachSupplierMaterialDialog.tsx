import { PackageMinusIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { materialKeys } from '@/entities/material'
import { supplierKeys, useDetachSupplierMaterial, type SupplierMaterial } from '@/entities/supplier'

type Props = {
  supplier: { slug: string; code: string }
  /** `null` = đóng. Một vật tư (menu ⋯ trên dòng) hoặc nhiều (các dòng đã tick). */
  materials: SupplierMaterial[] | null
  onOpenChange: (open: boolean) => void
  /** Gỡ xong — bên gọi bỏ chọn các dòng. */
  onDetached?: () => void
}

/**
 * Gỡ vật tư khỏi nhà cung cấp (`DELETE /suppliers/{slug}/materials`, `{ materialSlugs }`) — tất cả hoặc không: một
 * vật tư đã không còn gắn (101213) là cả lô bị từ chối. Lỗi đã có toast toàn cục — hộp không toast lại.
 */
export function DetachSupplierMaterialDialog({
  supplier,
  materials,
  onOpenChange,
  onDetached,
}: Props) {
  const { t } = useTranslation(['suppliers', 'common'])
  const qc = useQueryClient()
  const detach = useDetachSupplierMaterial()
  // Giữ danh sách cuối khi hộp đang mờ dần — chữ không mất mã vật tư.
  const [last, setLast] = useState(materials)
  if (materials !== null && materials !== last) setLast(materials)
  const shown = materials ?? last ?? []
  const many = shown.length > 1

  return (
    <ConfirmDialog
      open={materials !== null}
      onOpenChange={onOpenChange}
      tone="destructive"
      icon={<PackageMinusIcon />}
      title={
        many ? t('suppliers:detachManyTitle', { count: shown.length }) : t('suppliers:detachTitle')
      }
      description={
        <Trans
          ns={['suppliers', 'common']}
          i18nKey={many ? 'suppliers:detachManyConfirm' : 'suppliers:detachConfirm'}
          values={{
            count: shown.length,
            material: shown[0]?.code ?? '',
            supplier: supplier.code,
          }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      details={
        many && (
          <ul className="max-h-40 overflow-y-auto rounded-md border text-left text-sm">
            {shown.map((m) => (
              <li key={m.slug} className="border-b px-3 py-1.5 break-words last:border-b-0">
                <span className="font-medium">{m.code}</span> · {m.name}
              </li>
            ))}
          </ul>
        )
      }
      confirmLabel={detach.isPending ? t('common:saving') : t('suppliers:detach')}
      isPending={detach.isPending}
      onConfirm={() => {
        if (!materials || materials.length === 0) return
        detach.mutate(
          { slug: supplier.slug, materialSlugs: materials.map((m) => m.slug) },
          {
            onSuccess: () => {
              void qc.invalidateQueries({ queryKey: materialKeys.all })
              onDetached?.()
              onOpenChange(false)
            },
            onError: (error) => {
              // 101213: có vật tư đã không còn gắn (người khác gỡ trước) → làm mới danh sách, đóng hộp;
              // toast toàn cục vẫn báo lỗi.
              if (isApiError(error) && error.code === 101213) {
                void qc.invalidateQueries({ queryKey: supplierKeys.materials(supplier.slug) })
                onOpenChange(false)
              }
            },
          },
        )
      }}
    />
  )
}
