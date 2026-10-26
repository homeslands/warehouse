import { UserCogIcon, UserMinusIcon } from 'lucide-react'
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
import { DialogConfirmStep } from '@/shared/ui/DialogConfirmStep'
import { DialogIcon } from '@/shared/ui/DialogIcon'
import { Label } from '@/shared/ui/label'
import { useManagerCandidates } from '@/entities/user'
import { formatPersonLabel } from '@/shared/lib/person-name'
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
  // Nhóm C: bước xác nhận nằm ngay trong hộp. `unassigning` = đang hỏi "Bỏ gán" thay vì "Gán".
  const [step, setStep] = useState<'edit' | 'confirm'>('edit')
  const [unassigning, setUnassigning] = useState(false)

  // Mở cho một kho khác không được còn lựa chọn/lỗi của lần trước.
  useEffect(() => {
    if (warehouse) {
      setSelected(warehouse.manager?.slug)
      setFieldError(null)
      setStep('edit')
      setUnassigning(false)
    }
  }, [warehouse])

  // Quản lý hiện tại có thể đã bị khoá → không nằm trong danh sách ứng viên. Vẫn phải hiện được
  // giá trị đang gán, nếu không ô chọn trông như đang trống.
  const options: ComboboxOption[] = candidates.map((c) => ({
    value: c.slug,
    label: formatPersonLabel(c),
  }))
  const current = warehouse?.manager
  if (current && !options.some((o) => o.value === current.slug)) {
    options.unshift({
      value: current.slug,
      label: formatPersonLabel(current),
    })
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setStep('edit')
      setUnassigning(false)
    }
    onOpenChange(open)
  }

  const ask = (isUnassign: boolean) => {
    setUnassigning(isUnassign)
    setStep('confirm')
  }

  const submit = () => {
    if (!warehouse) return
    const managerSlug = unassigning ? null : (selected ?? null)
    setFieldError(null)
    assign.mutate(
      { slug: warehouse.slug, input: { managerSlug } },
      {
        onSuccess: () => handleOpenChange(false),
        onError: (error) => {
          if (isApiError(error) && error.code !== undefined && FIELD_CODES.has(error.code)) {
            // Lỗi thuộc ô chọn → về màn nhập để sửa lựa chọn.
            setFieldError(resolveApiErrorMessage(error))
            setStep('edit')
            return
          }
          // Lỗi khác (404 kho…) → toast, ở lại màn xác nhận.
          toastApiError(error)
        },
      },
    )
  }

  const selectedLabel = options.find((o) => o.value === selected)?.label ?? ''

  return (
    <Dialog open={warehouse !== null} onOpenChange={handleOpenChange}>
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
        {step === 'confirm' ? (
          <DialogConfirmStep
            icon={unassigning ? <UserMinusIcon /> : <UserCogIcon />}
            tone={unassigning ? 'destructive' : 'default'}
            title={
              unassigning
                ? t('warehouses:unassignManagerConfirmTitle', { warehouse: warehouse?.name })
                : t('warehouses:assignManagerConfirmTitle', {
                    name: selectedLabel,
                    warehouse: warehouse?.name,
                  })
            }
            description={
              unassigning
                ? t('warehouses:unassignManagerConfirmDescription')
                : t('warehouses:assignManagerConfirmDescription')
            }
            confirmLabel={
              assign.isPending
                ? t('common:saving')
                : unassigning
                  ? t('warehouses:unassignManagerConfirmAction')
                  : t('warehouses:assignManagerConfirmAction')
            }
            isPending={assign.isPending}
            onBack={() => setStep('edit')}
            onConfirm={submit}
          />
        ) : (
          <>
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
                onClick={() => handleOpenChange(false)}
              >
                {t('common:cancel')}
              </Button>
              {warehouse?.manager !== undefined && (
                <Button
                  type="button"
                  variant="outline"
                  size="xl"
                  disabled={assign.isPending}
                  onClick={() => ask(true)}
                >
                  {t('warehouses:unassignAction')}
                </Button>
              )}
              <Button
                type="button"
                size="xl"
                disabled={
                  assign.isPending ||
                  selected === undefined ||
                  selected === warehouse?.manager?.slug
                }
                onClick={() => ask(false)}
              >
                {t('common:save')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
