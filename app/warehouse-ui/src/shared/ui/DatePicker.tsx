import { format, isValid, parse } from 'date-fns'
import { CalendarIcon, XIcon } from 'lucide-react'
import { useCallback, useRef, useState, type ComponentProps } from 'react'
import { enUS, vi } from 'react-day-picker/locale'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { formatDate } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Calendar } from '@/shared/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'

/** Định dạng giá trị trao đổi với form/backend — ngày không giờ, không múi giờ. */
const VALUE_FORMAT = 'yyyy-MM-dd'

type DatePickerProps = Omit<ComponentProps<'button'>, 'value' | 'onChange'> & {
  /** `YYYY-MM-DD` hoặc `undefined`. */
  value: string | undefined
  onChange: (value: string | undefined) => void
  placeholder?: string
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  // parse theo giờ địa phương — `new Date('2026-09-18')` là 00:00 UTC, lệch ngày ở múi giờ âm.
  const date = parse(value, VALUE_FORMAT, new Date())
  return isValid(date) ? date : undefined
}

/**
 * Chọn một ngày. Lịch theo ngôn ngữ đang chọn (tên tháng, thứ, ngày đầu tuần); nút hiện ngày qua
 * `formatDate`. Props còn lại (id, aria-*) đi vào nút mở — để `FormControl` nối được nhãn và lỗi.
 */
export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  ref,
  ...triggerProps
}: DatePickerProps) {
  const { t, i18n } = useTranslation(['common'])
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  // Giữ ref riêng để trả focus về nút mở sau khi xoá, vẫn chuyển tiếp ref ngoài (RHF focus lỗi).
  const setTriggerRef = useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
  const selected = toDate(value)

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* modal: Popover portal ra ngoài Dialog; không modal thì RemoveScroll của Dialog chặn lăn chuột
          trong danh sách/lịch. */}
      <Popover modal open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="flex-1 justify-start font-normal"
            {...triggerProps}
            ref={setTriggerRef}
          >
            <CalendarIcon aria-hidden />
            {selected ? (
              formatDate(selected)
            ) : (
              <span className="text-muted-foreground">{placeholder ?? t('common:pickDate')}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            locale={i18n.resolvedLanguage === 'en' ? enUS : vi}
            onSelect={(date) => {
              onChange(date ? format(date, VALUE_FORMAT) : undefined)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {selected && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('common:clearSelection')}
          onClick={() => {
            onChange(undefined)
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
