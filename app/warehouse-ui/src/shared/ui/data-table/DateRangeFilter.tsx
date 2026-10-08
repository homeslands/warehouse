import { format, isAfter, isValid, parse } from 'date-fns'
import { CalendarIcon, XIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { enUS, vi } from 'react-day-picker/locale'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { formatDate } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Calendar } from '@/shared/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { CHIP_FRAME, CHIP_INNER, useFilterDisplay } from './filter-display'

/** Ngày không giờ, không múi giờ — cùng định dạng với `DatePicker` và tham số ngày của backend. */
const VALUE_FORMAT = 'yyyy-MM-dd'

/** Hai đầu `YYYY-MM-DD`, đều tuỳ chọn: chỉ `from` = "từ ngày đó", chỉ `to` = "đến ngày đó". */
export type DateRangeValue = { from?: string; to?: string }

type DateRangeFilterProps = {
  /** Nhãn của bộ lọc — hiện trên nút khi chưa lọc, và là tên cho screen reader. */
  label: string
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  className?: string
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  // parse theo giờ địa phương — `new Date('2026-09-18')` là 00:00 UTC, lệch ngày ở múi giờ âm.
  const date = parse(value, VALUE_FORMAT, new Date())
  return isValid(date) ? date : undefined
}

const toValue = (date: Date) => format(date, VALUE_FORMAT)

/**
 * Ô lọc khoảng ngày trên thanh công cụ. Mỗi lần mở lịch là chọn một khoảng MỚI: bấm ngày đầu (chưa
 * áp dụng), bấm ngày thứ hai → áp dụng và đóng; thứ tự hai lần bấm không quan trọng. Bấm một ngày
 * rồi đóng → lọc "từ ngày đó". Không dùng `addToRange` mặc định của react-day-picker vì nó nối vào
 * khoảng đang có thay vì bắt đầu lại.
 */
export function DateRangeFilter({ label, value, onChange, className }: DateRangeFilterProps) {
  const { t, i18n } = useTranslation(['common'])
  const [open, setOpen] = useState(false)
  // Ngày đầu vừa bấm trong lần mở này, chờ ngày thứ hai.
  const [pending, setPending] = useState<Date | undefined>(undefined)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const from = toDate(value.from)
  const to = toDate(value.to)
  const hasValue = from !== undefined || to !== undefined

  const display =
    from && to
      ? `${formatDate(from)} – ${formatDate(to)}`
      : from
        ? t('common:dateFrom', { date: formatDate(from) })
        : to
          ? t('common:dateTo', { date: formatDate(to) })
          : undefined

  function handleOpenChange(next: boolean) {
    if (!next && pending) onChange({ from: toValue(pending), to: undefined })
    setPending(undefined)
    setOpen(next)
  }

  function handleDayClick(day: Date) {
    if (!pending) {
      setPending(day)
      return
    }
    const [start, end] = isAfter(pending, day) ? [day, pending] : [pending, day]
    onChange({ from: toValue(start), to: toValue(end) })
    setPending(undefined)
    setOpen(false)
  }

  const chip = useFilterDisplay() === 'chip'

  return (
    <div
      data-active={chip ? hasValue : undefined}
      className={cn(chip ? CHIP_FRAME : 'flex items-center gap-1', className)}
    >
      <Popover modal open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant={chip ? 'ghost' : 'outline'}
            aria-label={display ? `${label}: ${display}` : label}
            className={cn(
              'flex-1 justify-start font-normal',
              chip &&
                cn(
                  'h-full rounded-full pl-3 hover:bg-transparent dark:hover:bg-transparent',
                  CHIP_INNER,
                ),
              chip && hasValue && 'pr-1 font-medium',
            )}
          >
            <CalendarIcon aria-hidden />
            {display ?? <span className="text-muted-foreground">{label}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={pending ? { from: pending, to: undefined } : { from, to }}
            defaultMonth={pending ?? from ?? to}
            locale={i18n.resolvedLanguage === 'en' ? enUS : vi}
            // Bỏ khoảng react-day-picker tự tính — chỉ cần ngày được bấm.
            onSelect={(_range, day) => handleDayClick(day)}
          />
        </PopoverContent>
      </Popover>
      {hasValue && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(chip && 'mr-1.5 size-6 rounded-full')}
          aria-label={t('common:clearSelection')}
          onClick={() => {
            onChange({})
            // Nút xoá sắp biến mất — không để focus rơi xuống <body>.
            triggerRef.current?.focus()
          }}
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
}
