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
  /** `null` = đóng. */
  material: SupplierMaterial | null
  onOpenChange: (open: boolean) => void
}

/**
 * Gỡ vật tư khỏi nhà cung cấp (`DELETE /suppliers/{slug}/materials/{materialSlug}`).
 * Lỗi đã có toast toàn cục từ mutation — hộp không toast lại, chỉ giữ nguyên để thử lại.
 */
export function DetachSupplierMaterialDialog({ supplier, material, onOpenChange }: Props) {
  const { t } = useTranslation(['suppliers', 'common'])
  const qc = useQueryClient()
  const detach = useDetachSupplierMaterial()
  // Giữ bản ghi cuối khi hộp đang mờ dần — chữ không mất mã vật tư.
  const [last, setLast] = useState(material)
  if (material !== null && material !== last) setLast(material)
  const shown = material ?? last

  return (
    <ConfirmDialog
      open={material !== null}
      onOpenChange={onOpenChange}
      tone="destructive"
      icon={<PackageMinusIcon />}
      title={t('suppliers:detachTitle')}
      description={
        <Trans
          ns={['suppliers', 'common']}
          i18nKey="suppliers:detachConfirm"
          values={{ material: shown?.code ?? '', supplier: supplier.code }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      confirmLabel={detach.isPending ? t('common:saving') : t('suppliers:detach')}
      isPending={detach.isPending}
      onConfirm={() => {
        if (!material) return
        detach.mutate(
          { slug: supplier.slug, materialSlug: material.slug },
          {
            onSuccess: () => {
              void qc.invalidateQueries({ queryKey: materialKeys.all })
              onOpenChange(false)
            },
            onError: (error) => {
              // 101213: vật tư đã không còn gắn (người khác gỡ trước) → làm mới danh sách, đóng hộp;
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
