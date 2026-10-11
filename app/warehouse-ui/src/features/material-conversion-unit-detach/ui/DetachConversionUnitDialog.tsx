import { useQueryClient } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { useDetachConversionUnit, type MaterialConversionUnit } from '@/entities/material'
import { unitKeys } from '@/entities/unit'

type Props = {
  materialSlug: string
  /** `null` = đóng. Dòng đơn vị gốc không bao giờ tới đây (widget không có mục Gỡ cho nó). */
  unit: MaterialConversionUnit | null
  onOpenChange: (open: boolean) => void
}

/** Lỗi đi toast qua chốt chung (hook không đặt `suppressErrorToast`). */
export function DetachConversionUnitDialog({ materialSlug, unit, onOpenChange }: Props) {
  const { t } = useTranslation(['materials', 'common'])
  const qc = useQueryClient()
  const detach = useDetachConversionUnit()

  // Giữ bản ghi cuối để lúc hộp mờ dần không hiện câu xác nhận với tên trống.
  const [last, setLast] = useState(unit)
  if (unit !== null && unit !== last) setLast(unit)
  const shown = unit ?? last

  const confirm = () => {
    if (!unit) return
    detach.mutate(
      { slug: materialSlug, unitSlug: unit.unitSlug },
      {
        onSuccess: () => {
          // Cột "Đang dùng" của màn Đơn vị đếm cả đơn vị quy đổi.
          void qc.invalidateQueries({ queryKey: unitKeys.all })
          onOpenChange(false)
        },
        onError: () => onOpenChange(false),
      },
    )
  }

  return (
    <ConfirmDialog
      open={unit !== null}
      onOpenChange={onOpenChange}
      icon={<Trash2Icon />}
      title={t('materials:detachTitle')}
      description={
        <Trans
          ns={['materials', 'common']}
          i18nKey="materials:detachConfirm"
          values={{ unit: shown ? `${shown.unitCode} · ${shown.unitName}` : '' }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      confirmLabel={detach.isPending ? t('materials:detaching') : t('materials:detachAction')}
      isPending={detach.isPending}
      onConfirm={confirm}
    />
  )
}
