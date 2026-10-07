import { UserPlusIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { formatPersonLabel } from '@/shared/lib/person-name'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { Combobox, type ComboboxOption } from '@/shared/ui/Combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { DialogIcon } from '@/shared/ui/DialogIcon'
import { Label } from '@/shared/ui/label'
import { useRoleLabel } from '@/entities/session'
import { userKeys } from '@/entities/user'
import { useAssignWarehouseMember, useAvailableMembers, warehouseKeys } from '@/entities/warehouse'

/** Lỗi thuộc về ô chọn người dùng — hiện ngay trong hộp. Còn lại (404 kho…) đi toast. */
const FIELD_CODES = new Set([100518, 100519, 100520, 100524])

type Props = {
  /** `null` = đóng. */
  warehouse: { slug: string; name: string } | null
  onOpenChange: (open: boolean) => void
}

export function AddWarehouseMemberDialog({ warehouse, onOpenChange }: Props) {
  const { t } = useTranslation(['warehouses', 'common'])
  const qc = useQueryClient()
  const roleLabel = useRoleLabel()
  const assign = useAssignWarehouseMember()
  // Chỉ tải khi hộp mở — trang chi tiết kho không cần danh sách ứng viên.
  const candidates = useAvailableMembers(warehouse?.slug ?? '', { enabled: warehouse !== null })

  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [fieldError, setFieldError] = useState<string | null>(null)

  // Mở cho kho khác (hoặc mở lại) → bỏ lựa chọn và lỗi của lần trước.
  const slug = warehouse?.slug
  useEffect(() => {
    if (slug !== undefined) {
      setSelected(undefined)
      setFieldError(null)
    }
  }, [slug])

  const options: ComboboxOption[] = (candidates.data?.items ?? []).map((candidate) => ({
    value: candidate.slug,
    label: `${formatPersonLabel(candidate)} · ${roleLabel(candidate.roleName)}`,
  }))

  const submit = () => {
    if (!warehouse || selected === undefined) return
    setFieldError(null)
    assign.mutate(
      { slug: warehouse.slug, userSlug: selected },
      {
        onSuccess: () => {
          // Danh sách thành viên là `GET /users?warehouseSlug=` (entity user) — hook của entity
          // warehouse chỉ tải lại ứng viên; phần liên entity nằm ở đây.
          void qc.invalidateQueries({ queryKey: userKeys.all })
          onOpenChange(false)
        },
        onError: (error) => {
          if (isApiError(error) && error.code !== undefined && FIELD_CODES.has(error.code)) {
            setFieldError(resolveApiErrorMessage(error))
            // Ứng viên vừa bị từ chối (đã bị khoá / đã là quản trị…) → tải lại để biến khỏi ô chọn.
            void qc.invalidateQueries({ queryKey: warehouseKeys.availableMembers(warehouse.slug) })
            return
          }
          toastApiError(error)
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={warehouse !== null} onOpenChange={onOpenChange}>
      <DialogContent
        // `Dialog.Close` gọi thẳng `onOpenChange` nên nút × vượt được chốt isPending — giấu nó lúc
        // đang gửi để không còn lối đóng nào lọt qua.
        showCloseButton={!assign.isPending}
        onEscapeKeyDown={(event) => {
          if (assign.isPending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (assign.isPending) event.preventDefault()
        }}
      >
        <DialogHeader className="items-center text-center">
          <DialogIcon>
            <UserPlusIcon />
          </DialogIcon>
          <DialogTitle>{t('warehouses:addMemberTitle')}</DialogTitle>
          <DialogDescription>{warehouse?.name}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="warehouse-member">{t('warehouses:fieldMember')}</Label>
          <Combobox
            id="warehouse-member"
            options={options}
            value={selected}
            onChange={setSelected}
            disabled={assign.isPending}
            placeholder={
              candidates.isPending ? t('common:loading') : t('warehouses:memberPlaceholder')
            }
            emptyText={t('warehouses:noMemberAvailable')}
            aria-invalid={fieldError !== null}
          />
          {fieldError !== null && (
            <p role="alert" className="text-destructive text-sm">
              {fieldError}
            </p>
          )}
        </div>

        <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
          <Button
            type="button"
            variant="outline"
            size="xl"
            disabled={assign.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common:cancel')}
          </Button>
          <Button
            type="button"
            size="xl"
            disabled={assign.isPending || selected === undefined}
            onClick={submit}
          >
            {assign.isPending ? t('common:saving') : t('warehouses:addMember')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
