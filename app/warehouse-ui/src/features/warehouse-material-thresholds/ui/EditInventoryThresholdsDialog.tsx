import { useQueryClient } from '@tanstack/react-query'
import { SlidersHorizontalIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { isApiError } from '@/shared/api/http'
import { formatQuantity } from '@/shared/lib/format'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
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
import { NumberInput } from '@/shared/ui/NumberInput'
import { importFormKeys } from '@/entities/import-form'
import {
  INVENTORY_NOT_FOUND,
  inventoryKeys,
  useUpdateInventoryThresholds,
} from '@/entities/inventory'
import { useMaterial } from '@/entities/material'
import {
  EMPTY_THRESHOLD_DRAFT,
  buildThresholdPatch,
  hasThresholdDraftChanges,
  initialThresholdDraft,
  mapThresholdApiError,
  validateThresholdDraft,
  type MaterialThresholdDefaults,
  type ThresholdDraft,
  type ThresholdEditErrors,
  type ThresholdFieldDraft,
  type ThresholdKey,
  type ThresholdTarget,
} from '../model/thresholds'

type Props = {
  warehouseSlug: string
  /** `null` = đóng. */
  item: ThresholdTarget | null
  onOpenChange: (open: boolean) => void
  /** Vật tư không còn thuộc kho (100801) → bên gọi đóng sheet liên quan nếu đang mở. */
  onNotFound?: (materialSlug: string) => void
}

/** Hộp sửa ngưỡng tồn riêng cho một vật tư trong kho (`PATCH /warehouses/{w}/materials/{m}`). */
export function EditInventoryThresholdsDialog({
  warehouseSlug,
  item,
  onOpenChange,
  onNotFound,
}: Props) {
  const { t } = useTranslation(['inventory', 'common'])
  const qc = useQueryClient()
  const formId = useId()
  const update = useUpdateInventoryThresholds()

  // Giữ bản ghi cuối khi hộp đang đóng dần; đồng bộ ngay trong render khi mở vật tư mới để không nháy dữ liệu cũ.
  const [prevItem, setPrevItem] = useState(item)
  const [last, setLast] = useState(item)
  const [draft, setDraft] = useState<ThresholdDraft>(() =>
    item ? initialThresholdDraft(item) : EMPTY_THRESHOLD_DRAFT,
  )
  const [errors, setErrors] = useState<ThresholdEditErrors>({})
  const [tried, setTried] = useState(false)
  const [step, setStep] = useState<'edit' | 'confirm'>('edit')
  const inputRefs = useRef<Partial<Record<ThresholdKey, HTMLInputElement | null>>>({})

  if (item !== prevItem) {
    setPrevItem(item)
    if (item !== null) {
      setLast(item)
      setDraft(initialThresholdDraft(item))
      setErrors({})
      setTried(false)
      setStep('edit')
    }
  }
  const shown = item ?? last

  // Chỉ tải chi tiết vật tư khi kho đang đặt override riêng để biết đúng ngưỡng mặc định khi bấm "Dùng mặc định".
  const material = useMaterial(shown?.materialSlug ?? '', {
    enabled: item !== null && (item.minimumInventory !== null || item.maximumInventory !== null),
  })

  const defaultMin = shown
    ? shown.minimumInventory === null
      ? shown.effectiveMinimumInventory
      : material.data?.minimumInventory
    : undefined
  const defaultMax = shown
    ? shown.maximumInventory === null
      ? shown.effectiveMaximumInventory
      : material.data?.maximumInventory
    : undefined
  const defaults: MaterialThresholdDefaults = {
    minimumInventory: defaultMin,
    maximumInventory: defaultMax,
  }

  const patch = shown ? buildThresholdPatch(draft, shown) : {}
  const hasChanges = shown ? hasThresholdDraftChanges(draft, shown) : false
  const isDirty = Object.keys(patch).length > 0

  const handleOpenChange = (open: boolean) => {
    if (!open && update.isPending) return
    if (!open) setStep('edit')
    onOpenChange(open)
  }

  const applyFieldDraft = (key: ThresholdKey, nextField: ThresholdFieldDraft) => {
    if (!shown) return
    const next = { ...draft, [key]: nextField }
    setDraft(next)
    if (tried) {
      setErrors(validateThresholdDraft(next, shown, defaults))
    }
  }

  const updateNumberField = (key: ThresholdKey, value: number | undefined) => {
    if (draft[key].mode === 'default' && value === undefined) return
    applyFieldDraft(key, { mode: 'custom', value })
  }

  const resetToDefault = (key: ThresholdKey) => {
    applyFieldDraft(key, { mode: 'default' })
  }

  const askConfirm = (event: React.FormEvent) => {
    event.preventDefault()
    if (!shown || !hasChanges || update.isPending) return
    const nextErrors = validateThresholdDraft(draft, shown, defaults)
    setErrors(nextErrors)
    setTried(true)
    if (nextErrors.minimumInventory || nextErrors.maximumInventory) {
      const firstKey: ThresholdKey = nextErrors.minimumInventory
        ? 'minimumInventory'
        : 'maximumInventory'
      inputRefs.current[firstKey]?.focus()
      return
    }
    setStep('confirm')
  }

  const submit = () => {
    if (!item || !isDirty || update.isPending) return
    const name = `${item.materialCode} · ${item.materialName}`
    update.mutate(
      { warehouseSlug, materialSlug: item.materialSlug, patch },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: importFormKeys.available(warehouseSlug) })
          toast.success(t('inventory:editThresholdsUpdatedToast', { name }))
          onOpenChange(false)
        },
        onError: (error) => {
          if (isApiError(error)) {
            const mapped = mapThresholdApiError(error.code, patch)
            if (mapped) {
              const firstKey: ThresholdKey = mapped.minimumInventory
                ? 'minimumInventory'
                : 'maximumInventory'
              flushSync(() => {
                setErrors(mapped)
                setTried(true)
                setStep('edit')
              })
              inputRefs.current[firstKey]?.focus()
              return
            }
            if (error.code === INVENTORY_NOT_FOUND) {
              void qc.invalidateQueries({ queryKey: inventoryKeys.warehouse(warehouseSlug) })
              void qc.invalidateQueries({ queryKey: importFormKeys.available(warehouseSlug) })
              toast.info(t('inventory:alreadyRemovedToast', { name }))
              onNotFound?.(item.materialSlug)
              onOpenChange(false)
              return
            }
          }
          toastApiError(error)
        },
      },
    )
  }

  const unit = shown?.baseUnit?.code
  const titleText = shown ? `${shown.materialCode} · ${shown.materialName}` : ''
  const fields: {
    key: ThresholdKey
    label: string
    defaultLabel: string | undefined
  }[] = shown
    ? [
        {
          key: 'minimumInventory',
          label: t('inventory:fieldMinimum'),
          defaultLabel: formatDefault(defaultMin, t('inventory:thresholdNotSet')),
        },
        {
          key: 'maximumInventory',
          label: t('inventory:fieldMaximum'),
          defaultLabel: formatDefault(defaultMax, t('inventory:thresholdUnlimited')),
        },
      ]
    : []

  const formatDefaultBadge = (defaultLabel: string | undefined) =>
    defaultLabel !== undefined
      ? t('inventory:thresholdDefaultBadge', { value: defaultLabel })
      : t('inventory:thresholdDefaultShort')

  const changes =
    step === 'confirm' && shown
      ? fields.flatMap((f) => {
          if (!(f.key in patch)) return []
          const nextValue = patch[f.key]
          if (nextValue === undefined) return []
          const prevValue = shown[f.key]
          return [
            {
              key: f.key,
              label: f.label,
              from:
                prevValue === null ? formatDefaultBadge(f.defaultLabel) : formatQuantity(prevValue),
              to:
                nextValue === null ? formatDefaultBadge(f.defaultLabel) : formatQuantity(nextValue),
            },
          ]
        })
      : []

  return (
    <Dialog open={item !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!update.isPending}
        onEscapeKeyDown={(event) => {
          if (update.isPending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (update.isPending) event.preventDefault()
        }}
      >
        {step === 'confirm' ? (
          <DialogConfirmStep
            icon={<SlidersHorizontalIcon />}
            title={t('inventory:editThresholdsConfirmTitle')}
            description={titleText}
            details={
              changes.length > 0 ? (
                <dl className="divide-y rounded-lg border px-3 text-sm">
                  {changes.map((c) => (
                    <div key={c.key} className="flex items-center justify-between gap-4 py-2">
                      <dt className="text-muted-foreground">{c.label}</dt>
                      <dd className="font-medium tabular-nums">
                        {c.from} → {c.to}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : undefined
            }
            confirmLabel={update.isPending ? t('common:saving') : t('common:saveChanges')}
            isPending={update.isPending}
            onBack={() => setStep('edit')}
            onConfirm={submit}
          />
        ) : (
          <form noValidate onSubmit={askConfirm} className="space-y-4">
            <DialogHeader className="items-center text-center">
              <DialogIcon>
                <SlidersHorizontalIcon />
              </DialogIcon>
              <DialogTitle>{t('inventory:editThresholdsTitle')}</DialogTitle>
              <DialogDescription>
                {titleText}
                {unit ? ` (${unit})` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((f) => {
                const inputId = `${formId}-${f.key}`
                const error = errors[f.key]
                const fieldDraft = draft[f.key]
                const isDefault = fieldDraft.mode === 'default'
                const value = fieldDraft.mode === 'custom' ? fieldDraft.value : undefined
                const needsMaterial = shown !== null && shown[f.key] !== null
                const statusId = `${inputId}-status`
                const errorId = `${inputId}-error`
                const placeholder =
                  isDefault && needsMaterial && material.isPending
                    ? t('inventory:thresholdLoadingDefault')
                    : (f.defaultLabel ?? t('inventory:thresholdUseDefault'))

                return (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={inputId}>{f.label}</Label>
                    <NumberInput
                      ref={(el) => {
                        inputRefs.current[f.key] = el
                      }}
                      id={inputId}
                      value={value}
                      onChange={(v) => updateNumberField(f.key, v)}
                      placeholder={placeholder}
                      disabled={update.isPending}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : isDefault ? statusId : undefined}
                    />
                    {error && (
                      <p id={errorId} role="alert" className="text-destructive text-sm">
                        {t(error.key, error.values ?? {})}
                      </p>
                    )}
                    {!isDefault ? (
                      <Button
                        type="button"
                        variant="link"
                        size="xs"
                        className="h-auto p-0 font-normal"
                        disabled={update.isPending}
                        onClick={() => resetToDefault(f.key)}
                      >
                        {t('inventory:thresholdUseDefault')}
                      </Button>
                    ) : (
                      !error && (
                        <>
                          {needsMaterial && material.isPending ? (
                            <p id={statusId} className="text-muted-foreground text-xs">
                              {t('inventory:thresholdLoadingDefault')}
                            </p>
                          ) : needsMaterial && material.isError ? (
                            <p
                              id={statusId}
                              className="text-destructive flex flex-wrap items-center gap-1.5 text-xs"
                            >
                              <span>{t('inventory:thresholdDefaultLoadFailed')}</span>
                              <Button
                                type="button"
                                variant="link"
                                size="xs"
                                className="h-auto p-0 font-normal"
                                disabled={update.isPending}
                                onClick={() => void material.refetch()}
                              >
                                {t('common:retry')}
                              </Button>
                            </p>
                          ) : (
                            <p id={statusId} className="text-muted-foreground text-xs">
                              {f.defaultLabel !== undefined
                                ? t('inventory:thresholdDefaultValue', { value: f.defaultLabel })
                                : t('inventory:thresholdFollowingDefault')}
                            </p>
                          )}
                        </>
                      )
                    )}
                  </div>
                )
              })}
            </div>

            <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
              <Button
                type="button"
                variant="outline"
                size="xl"
                disabled={update.isPending}
                onClick={() => handleOpenChange(false)}
              >
                {t('common:cancel')}
              </Button>
              <Button type="submit" size="xl" disabled={!hasChanges || update.isPending}>
                {t('common:save')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function formatDefault(value: number | undefined, zeroLabel: string): string | undefined {
  if (value === undefined) return undefined
  return value > 0 ? formatQuantity(value) : zeroLabel
}
