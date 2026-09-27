import { UserCogIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { toastApiError } from '@/shared/lib/toast-error'
import { isApiError } from '@/shared/api/http'
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
import { useManagerCandidates } from '@/entities/user'
import { useAssignWarehouseManager, type Warehouse } from '@/entities/warehouse'

/** Lỗi thuộc về ô chọn quản lý — hiện ngay trong hộp. Còn lại (404 kho) đi toast. */
const FIELD_CODES = new Set([100514, 100515, 100516])

type Props = {
  /** `null` = đóng. Thao tác trên MỘT ô chọn nên dùng Dialog, không phải FormSheet. */
  warehouse: Warehouse | null
  onOpenChange: (open: boolean) => void
}

export function AssignWarehouseManagerDialog({ warehouse, onOpenChange }: Props) {
  const { t } = useTranslation(['warehouses', 'common'])
  const { candidates, isPending: isLoadingCandidates, isRoleMissing } = useManagerCandidates()
  const assign = useAssignWarehouseManager()

  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [fieldError, setFieldError] = useState<string | null>(null)

  // Mở cho một kho khác không được còn lựa chọn/lỗi của lần trước.
  useEffect(() => {
    if (warehouse) {
      setSelected(warehouse.managerSlug)
      setFieldError(null)
    }
  }, [warehouse])

  // Quản lý hiện tại có thể đã bị khoá → không nằm trong danh sách ứng viên. Vẫn phải hiện được
  // giá trị đang gán, nếu không ô chọn trông như đang trống.
  const options: ComboboxOption[] = candidates.map((c) => ({ value: c.slug, label: c.phonenumber }))
  if (warehouse?.managerSlug && !options.some((o) => o.value === warehouse.managerSlug)) {
    options.unshift({
      value: warehouse.managerSlug,
      label: warehouse.managerPhonenumber ?? warehouse.managerSlug,
    })
  }

  const submit = (managerSlug: string | null) => {
    if (!warehouse) return
    setFieldError(null)
    assign.mutate(
      { slug: warehouse.slug, input: { managerSlug } },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          if (isApiError(error) && error.code !== undefined && FIELD_CODES.has(error.code)) {
            setFieldError(resolveApiErrorMessage(error))
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
        // `Dialog.Close` của Radix gọi thẳng `onOpenChange`, KHÔNG đi qua `onEscapeKeyDown` /
        // `onPointerDownOutside` — nút × vì thế vượt được chốt isPending. Giấu nó lúc đang gửi để
        // không còn lối đóng nào lọt qua (cùng quy ước với FormSheet).
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
            <UserCogIcon />
          </DialogIcon>
          <DialogTitle>{t('warehouses:assignManagerTitle')}</DialogTitle>
          <DialogDescription>{warehouse?.name}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="warehouse-manager">{t('warehouses:fieldManager')}</Label>
          <Combobox
            id="warehouse-manager"
            options={options}
            value={selected}
            onChange={setSelected}
            disabled={isRoleMissing || assign.isPending}
            placeholder={
              isLoadingCandidates ? t('common:loading') : t('warehouses:managerPlaceholder')
            }
            emptyText={t('warehouses:noManagerCandidate')}
            aria-invalid={fieldError !== null}
          />
          {isRoleMissing && (
            <p className="text-muted-foreground text-sm">{t('warehouses:noManagerRole')}</p>
          )}
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
          {warehouse?.managerSlug !== undefined && (
            <Button
              type="button"
              variant="outline"
              size="xl"
              disabled={assign.isPending}
              onClick={() => submit(null)}
            >
              {t('warehouses:unassignAction')}
            </Button>
          )}
          <Button
            type="button"
            size="xl"
            disabled={assign.isPending || selected === undefined}
            onClick={() => submit(selected ?? null)}
          >
            {assign.isPending ? t('common:saving') : t('common:save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
