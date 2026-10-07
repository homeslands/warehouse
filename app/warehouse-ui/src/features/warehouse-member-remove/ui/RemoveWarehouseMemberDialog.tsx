import { UserMinusIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { formatPersonLabel } from '@/shared/lib/person-name'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { userKeys } from '@/entities/user'
import { useRemoveWarehouseMember } from '@/entities/warehouse'

type Member = { slug: string; phonenumber: string; firstName?: string; lastName?: string }

type Props = {
  warehouseSlug: string
  /** `null` = đóng. */
  member: Member | null
  onOpenChange: (open: boolean) => void
}

/** Gỡ một thành viên khỏi kho (`DELETE /warehouses/{slug}/members/{userSlug}`). Không bắt gõ xác nhận. */
export function RemoveWarehouseMemberDialog({ warehouseSlug, member, onOpenChange }: Props) {
  const { t } = useTranslation(['warehouses', 'common'])
  const qc = useQueryClient()
  const remove = useRemoveWarehouseMember()
  // Giữ bản ghi cuối khi hộp đang mờ dần — chữ không mất tên.
  const [last, setLast] = useState(member)
  if (member !== null && member !== last) setLast(member)
  const shown = member ?? last

  return (
    <ConfirmDialog
      open={member !== null}
      onOpenChange={onOpenChange}
      tone="destructive"
      icon={<UserMinusIcon />}
      title={t('warehouses:removeMemberTitle')}
      description={
        <Trans
          ns={['warehouses', 'common']}
          i18nKey="warehouses:removeMemberConfirm"
          values={{ name: shown ? formatPersonLabel(shown) : '' }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      confirmLabel={remove.isPending ? t('common:saving') : t('warehouses:removeMemberAction')}
      isPending={remove.isPending}
      onConfirm={() => {
        if (!member) return
        remove.mutate(
          { slug: warehouseSlug, userSlug: member.slug },
          {
            onSuccess: () => {
              void qc.invalidateQueries({ queryKey: userKeys.all })
              onOpenChange(false)
            },
          },
        )
      }}
    />
  )
}
