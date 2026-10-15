import { PackageMinusIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { isApiError } from '@/shared/api/http'
import { toastApiError } from '@/shared/lib/toast-error'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { importFormKeys } from '@/entities/import-form'
import {
  INVENTORY_NOT_FOUND,
  inventoryKeys,
  useRemoveWarehouseMaterial,
} from '@/entities/inventory'
import { materialKeys } from '@/entities/material'

export type RemovableMaterial = { materialSlug: string; materialCode: string; materialName: string }

type Props = {
  warehouse: { slug: string; name: string }
  /** `null` = đóng. */
  item: RemovableMaterial | null
  onOpenChange: (open: boolean) => void
  /** Vật tư đã không còn ở kho (gỡ xong hoặc 100801) — bên gọi đóng sheet của vật tư đó. */
  onRemoved?: (materialSlug: string) => void
}

/**
 * Gỡ vật tư khỏi kho (`DELETE /warehouses/{w}/materials/{m}`). Bên gọi chỉ mở hộp khi tồn = 0 và giữ chỗ = 0
 * (`removeBlockReason`); dữ liệu trong tay có thể cũ nên vẫn xử lý 100807 / 100813 — toast lý do, đóng hộp, tải lại.
 * 100801 = người khác vừa gỡ → coi như đã xong.
 */
export function RemoveWarehouseMaterialDialog({ warehouse, item, onOpenChange, onRemoved }: Props) {
  const { t } = useTranslation(['inventory', 'common'])
  const qc = useQueryClient()
  const remove = useRemoveWarehouseMaterial()
  // Giữ bản ghi cuối khi hộp đang mờ dần — tiêu đề không mất tên.
  const [last, setLast] = useState(item)
  if (item !== null && item !== last) setLast(item)
  const shown = item ?? last
  const name = shown ? `${shown.materialCode} · ${shown.materialName}` : ''

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: inventoryKeys.warehouse(warehouse.slug) })
    void qc.invalidateQueries({ queryKey: materialKeys.all })
    void qc.invalidateQueries({ queryKey: importFormKeys.available(warehouse.slug) })
  }

  return (
    <ConfirmDialog
      open={item !== null}
      onOpenChange={onOpenChange}
      tone="destructive"
      icon={<PackageMinusIcon />}
      title={t('inventory:removeTitle', { name })}
      description={t('inventory:removeDescription', { warehouse: warehouse.name })}
      confirmLabel={remove.isPending ? t('inventory:removing') : t('inventory:removeAction')}
      isPending={remove.isPending}
      onConfirm={() => {
        if (!item) return
        remove.mutate(
          { warehouseSlug: warehouse.slug, materialSlug: item.materialSlug },
          {
            onSuccess: () => {
              refresh()
              toast.success(t('inventory:removedToast', { name }))
              onRemoved?.(item.materialSlug)
              onOpenChange(false)
            },
            onError: (error) => {
              refresh()
              if (isApiError(error) && error.code === INVENTORY_NOT_FOUND) {
                toast.info(t('inventory:alreadyRemovedToast', { name }))
                onRemoved?.(item.materialSlug)
              } else {
                toastApiError(error)
              }
              onOpenChange(false)
            },
          },
        )
      }}
    />
  )
}
