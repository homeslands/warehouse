import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRightIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { formatQuantity } from '@/shared/lib/format'
import { DECIMAL_18_6_LIMIT, hasAtMostDecimals } from '@/shared/lib/number'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { Combobox } from '@/shared/ui/Combobox'
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
import { NumberInput } from '@/shared/ui/NumberInput'
import {
  useAttachConversionUnit,
  useAvailableUnits,
  useUpdateConversionUnit,
  type MaterialConversionUnit,
} from '@/entities/material'
import { unitKeys } from '@/entities/unit'

/** Lỗi thuộc ô đơn vị / ô tỉ lệ — hiện ngay trong hộp. Còn lại (100714, 100717, 100721…) đi toast rồi đóng. */
const UNIT_FIELD_CODES = new Set([100715, 100716, 100901])
const RATE_FIELD_CODES = new Set([100718])

type Props = {
  material: { slug: string; baseUnitCode: string }
  open: boolean
  /** `null` = gắn đơn vị mới; có = sửa tỉ lệ của dòng này. */
  editing: MaterialConversionUnit | null
  onOpenChange: (open: boolean) => void
}

/** Thao tác hai ô → `Dialog` + state cục bộ (mẫu `AssignWarehouseManagerDialog`), không react-hook-form. */
export function ConversionUnitDialog({ material, open, editing, onOpenChange }: Props) {
  const { t } = useTranslation(['materials', 'common'])
  const qc = useQueryClient()
  const unitId = useId()
  const rateId = useId()
  const attach = useAttachConversionUnit()
  const update = useUpdateConversionUnit()
  const isPending = attach.isPending || update.isPending
  const available = useAvailableUnits(material.slug, { enabled: open && editing === null })

  const [unitSlug, setUnitSlug] = useState<string | undefined>(undefined)
  const [rate, setRate] = useState<number | undefined>(undefined)
  const [unitError, setUnitError] = useState<string | null>(null)
  const [rateError, setRateError] = useState<string | null>(null)

  // Mở lại / đổi dòng không được còn lựa chọn hay lỗi của lần trước.
  useEffect(() => {
    if (!open) return
    setUnitSlug(editing?.unitSlug)
    setRate(editing?.conversionRate)
    setUnitError(null)
    setRateError(null)
  }, [open, editing])

  const options = (available.data?.items ?? []).map((u) => ({
    value: u.slug,
    label: `${u.code} · ${u.name}`,
  }))
  const selectedCode = editing
    ? editing.unitCode
    : (available.data?.items.find((u) => u.slug === unitSlug)?.code ?? null)
  // Chế độ gắn: hết đơn vị gắn được / tải lỗi → không có gì để chọn, khoá Lưu (khác "chưa chọn").
  const noCandidates = !editing && available.isSuccess && options.length === 0
  const candidatesFailed = !editing && available.isError
  const rateValid = rate !== undefined && rate > 0 && hasAtMostDecimals(rate, 6)
  const rateFits = rate !== undefined && rate < DECIMAL_18_6_LIMIT
  const unchanged = editing !== null && rate === editing.conversionRate

  const onError = (error: unknown) => {
    if (isApiError(error) && error.code !== undefined) {
      if (UNIT_FIELD_CODES.has(error.code)) {
        setUnitError(resolveApiErrorMessage(error))
        return
      }
      if (RATE_FIELD_CODES.has(error.code)) {
        setRateError(resolveApiErrorMessage(error))
        return
      }
    }
    toastApiError(error)
    onOpenChange(false)
  }
  const onSuccess = () => {
    // Cột "Đang dùng" của màn Đơn vị đếm cả đơn vị quy đổi.
    void qc.invalidateQueries({ queryKey: unitKeys.all })
    onOpenChange(false)
  }

  const submit = () => {
    const nextUnitError = unitSlug === undefined ? t('materials:unitRequired') : null
    const nextRateError = !rateValid
      ? t('materials:rateInvalid')
      : !rateFits
        ? t('materials:rateTooLarge')
        : null
    setUnitError(nextUnitError)
    setRateError(nextRateError)
    if (nextUnitError || nextRateError || unitSlug === undefined || rate === undefined) return
    const vars = { slug: material.slug, unitSlug, conversionRate: rate }
    if (editing) update.mutate(vars, { onSuccess, onError })
    else attach.mutate(vars, { onSuccess, onError })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // `Dialog.Close` của Radix gọi thẳng `onOpenChange`, không đi qua hai handler dưới — giấu × lúc đang gửi.
        showCloseButton={!isPending}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault()
        }}
      >
        <DialogHeader className="items-center text-center">
          <DialogIcon>
            <ArrowLeftRightIcon />
          </DialogIcon>
          <DialogTitle>
            {editing ? t('materials:conversionEditTitle') : t('materials:conversionAddTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('materials:conversionsDescription', { unit: material.baseUnitCode })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={unitId}>{t('materials:fieldUnit')}</Label>
            {editing ? (
              <p id={unitId} className="text-sm font-medium">
                {editing.unitCode} · {editing.unitName}
              </p>
            ) : (
              <Combobox
                id={unitId}
                options={options}
                value={unitSlug}
                onChange={(next) => {
                  setUnitSlug(next)
                  setUnitError(null)
                }}
                disabled={isPending || noCandidates || candidatesFailed}
                placeholder={
                  available.isPending
                    ? t('common:loading')
                    : noCandidates
                      ? t('materials:noAvailableUnits')
                      : t('materials:unitPlaceholder')
                }
                emptyText={t('materials:noAvailableUnits')}
                aria-invalid={unitError !== null}
              />
            )}
            {candidatesFailed && (
              <div
                role="alert"
                className="text-destructive flex flex-wrap items-center gap-2 text-sm"
              >
                {resolveApiErrorMessage(available.error)}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => void available.refetch()}
                >
                  {t('common:retry')}
                </Button>
              </div>
            )}
            {unitError !== null && (
              <p role="alert" className="text-destructive text-sm">
                {unitError}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={rateId}>{t('materials:fieldRate')}</Label>
            <NumberInput
              id={rateId}
              value={rate}
              onChange={(next) => {
                setRate(next)
                setRateError(null)
              }}
              disabled={isPending}
              aria-invalid={rateError !== null}
            />
            {rateError !== null ? (
              <p role="alert" className="text-destructive text-sm">
                {rateError}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {selectedCode && rateValid && rateFits
                  ? t('materials:rateValue', {
                      unit: selectedCode,
                      rate: formatQuantity(rate),
                      base: material.baseUnitCode,
                    })
                  : t('materials:rateHint', { base: material.baseUnitCode })}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
          <Button
            type="button"
            variant="outline"
            size="xl"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common:cancel')}
          </Button>
          <Button
            type="button"
            size="xl"
            disabled={isPending || unchanged || noCandidates || candidatesFailed}
            onClick={submit}
          >
            {isPending ? t('common:saving') : t('common:save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
