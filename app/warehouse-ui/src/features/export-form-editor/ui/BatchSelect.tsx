import { format } from 'date-fns'
import { ChevronsUpDownIcon } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { formatDate, formatQuantity } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Command, CommandItem, CommandList } from '@/shared/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { useMaterialBatches, type MaterialBatch } from '@/entities/material-batch'

type Props = Omit<ComponentProps<'button'>, 'value' | 'onChange'> & {
  /** `''` = để BE tự chọn lô (FEFO). */
  value: string
  onChange: (batchSlug: string, batch?: MaterialBatch) => void
  warehouseSlug: string
  materialSlug: string
  baseUnitCode: string
  /** Lô đã chọn (nếu đã biết) để ghi HSD / còn bao nhiêu trên nút khi chưa mở danh sách. */
  selected?: MaterialBatch
  /** Thiếu MATERIAL_READ + WAREHOUSE_READ → không có nút, không gọi API lô. */
  canPickBatch: boolean
}

const expired = (batch: MaterialBatch, today: string) =>
  batch.expiryDate !== null && batch.expiryDate < today

/** Ô chọn lô của một dòng: mặc định "Tự chọn (hết hạn sớm nhất)", mở ra thì chọn tay một lô còn hàng (FEFO). */
export function BatchSelect({
  value,
  onChange,
  warehouseSlug,
  materialSlug,
  baseUnitCode,
  selected,
  canPickBatch,
  disabled,
  className,
  ref,
  ...triggerProps
}: Props) {
  const { t } = useTranslation('exportForms')
  const [open, setOpen] = useState(false)
  // Chỉ tải lô khi danh sách mở (và được phép) — không tải cho cả 200 dòng.
  const batches = useMaterialBatches(warehouseSlug, materialSlug, {
    enabled: open && canPickBatch && !disabled,
  })

  const quantityText = (batch: MaterialBatch) =>
    `${formatQuantity(batch.availableQuantity)} ${baseUnitCode}`.trim()
  const label =
    value === ''
      ? t('batchAutoFefo')
      : selected
        ? selected.expiryDate
          ? t('batchSummary', {
              date: formatDate(selected.expiryDate),
              value: quantityText(selected),
            })
          : t('batchSummaryNoExpiry', { value: quantityText(selected) })
        : t('batchUnknown')

  if (!canPickBatch) {
    return (
      <span
        id={triggerProps.id}
        className={cn('text-muted-foreground block min-w-0 pt-2 text-sm break-words', className)}
      >
        {value === '' ? t('batchAuto') : label}
      </span>
    )
  }

  const today = format(new Date(), 'yyyy-MM-dd')

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          title={label}
          className={cn('min-w-0 justify-between font-normal', className)}
          {...triggerProps}
          ref={ref}
        >
          <span className={cn('truncate', value === '' && 'text-muted-foreground')}>{label}</span>
          <ChevronsUpDownIcon className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={8}
        className="max-h-(--radix-popover-content-available-height) w-[min(30rem,calc(100vw-1rem))] p-0"
      >
        <Command shouldFilter={false} label={t('fieldBatch')} className="min-h-0">
          <CommandList className="max-h-72 min-h-0">
            <CommandItem
              value="__auto__"
              data-checked={value === ''}
              onSelect={() => {
                onChange('')
                setOpen(false)
              }}
            >
              {t('batchAutoFefo')}
            </CommandItem>
            {batches.isLoading && (
              <div role="status" className="text-muted-foreground py-4 text-center text-sm">
                {t('batchLoading')}
              </div>
            )}
            {batches.isError && (
              <p role="alert" className="text-destructive px-2 py-3 text-sm">
                {t('batchLoadFailed')}
              </p>
            )}
            {batches.data?.length === 0 && (
              <p className="text-muted-foreground px-2 py-3 text-sm">{t('batchEmpty')}</p>
            )}
            {batches.data?.map((batch) => {
              const reserved = batch.availableQuantity <= 0
              return (
                <CommandItem
                  key={batch.slug}
                  value={batch.slug}
                  disabled={reserved}
                  data-checked={batch.slug === value}
                  onSelect={() => {
                    onChange(batch.slug, batch)
                    setOpen(false)
                  }}
                >
                  <span className="grid min-w-0 flex-1 gap-y-0.5 text-sm">
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <span>{t('batchEntry', { date: formatDate(batch.entryDate) })}</span>
                      <span className="font-medium">
                        {batch.expiryDate
                          ? t('batchExpiry', { date: formatDate(batch.expiryDate) })
                          : t('batchNoExpiry')}
                      </span>
                      <span className="tabular-nums">
                        {t('batchAvailable', { value: quantityText(batch) })}
                      </span>
                    </span>
                    <span className="text-muted-foreground flex flex-wrap gap-x-3 break-all">
                      {batch.importFormCode && (
                        <span>{t('batchImportForm', { code: batch.importFormCode })}</span>
                      )}
                      {expired(batch, today) && (
                        <span className="text-destructive font-medium">{t('batchExpired')}</span>
                      )}
                      {reserved && <span>{t('batchReservedAll')}</span>}
                    </span>
                  </span>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
