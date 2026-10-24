import { XIcon } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { FilterField } from './FilterField'
import { CHIP_FRAME, CHIP_INNER, FILTER_LABEL_CLASS, useFilterDisplay } from './filter-display'

/** Tối đa bấy nhiêu lựa chọn thật (không tính "Tất cả") thì popover vẽ thành nút bấm nhanh thay cho dropdown. */
const MAX_QUICK_BUTTONS = 4

export type SelectFilterOption = { value: string; label: string }

/**
 * Radix Select không nhận `''` làm giá trị của một mục (chuỗi rỗng dành riêng cho "chưa chọn gì",
 * `Select.Item` có `value=""` sẽ ném lỗi). Mục "không lọc" vì thế mang giá trị nội bộ này và được
 * dịch ngược về `''` trước khi báo ra ngoài — bên ngoài `SelectFilter` vẫn chỉ thấy `''`.
 */
const ALL = '__all__'

type SelectFilterProps = {
  /** Nhãn cho screen reader; ô lọc trên thanh công cụ không có nhãn nhìn thấy được. */
  label: string
  /** `''` = không lọc (mục đầu tiên trong `options`). */
  value: string
  onChange: (value: string) => void
  options: SelectFilterOption[]
  className?: string
}

/**
 * Ô lọc một-trong-nhiều của màn danh sách. Dùng `Select` của shadcn để khớp phần còn lại của giao
 * diện — bộ lọc chỉ có vài lựa chọn cố định nên không cần ô tìm của `Combobox`.
 */
export function SelectFilter({ label, value, onChange, options, className }: SelectFilterProps) {
  // Tên dài (vd tên kho) bị cắt "…" trong độ rộng tối đa — `title` cho đọc được nhãn đầy đủ.
  const selectedLabel = options.find((option) => option.value === value)?.label
  const display = useFilterDisplay()
  const { t } = useTranslation(['common'])
  const triggerId = useId()

  const content = (
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option.value} value={option.value === '' ? ALL : option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  )
  const selectProps = {
    value: value === '' ? ALL : value,
    onValueChange: (next: string) => onChange(next === ALL ? '' : next),
  }

  if (display === 'chip') {
    // Chip (mobile): chưa chọn ghi TÊN bộ lọc thay cho "Tất cả …" (gọn, biết ngay là lọc gì); đã chọn ghi
    // GIÁ TRỊ, bỏ mũi tên, thêm ✕ — một chạm để bỏ lọc mà không phải mở danh sách.
    const active = value !== ''
    return (
      <div data-active={active} className={cn(CHIP_FRAME, className)}>
        <Select {...selectProps}>
          <SelectTrigger
            aria-label={label}
            title={active ? selectedLabel : undefined}
            className={cn(
              'h-full max-w-48 rounded-full border-0 bg-transparent pl-3.5 shadow-none dark:bg-transparent dark:hover:bg-transparent',
              CHIP_INNER,
              active && 'pr-1 font-medium [&>svg]:hidden',
            )}
          >
            <SelectValue>{active ? selectedLabel : label}</SelectValue>
          </SelectTrigger>
          {content}
        </Select>
        {active && (
          <button
            type="button"
            aria-label={t('common:clearFilterNamed', { name: label })}
            onClick={() => onChange('')}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mr-1.5 grid size-6 place-items-center rounded-full outline-none focus-visible:ring-3"
          >
            <XIcon className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    )
  }

  if (display === 'popover') {
    const real = options.filter((option) => option.value !== '')
    if (real.length > 0 && real.length <= MAX_QUICK_BUTTONS) {
      // Ít lựa chọn → nút bấm nhanh; bấm nút đang bật = bỏ lọc.
      return (
        <div className={className}>
          <FilterField label={label} group>
            <div className="flex flex-wrap gap-1.5">
              {real.map((option) => {
                const pressed = option.value === value
                return (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={pressed ? 'default' : 'outline'}
                    // Nhãn dài (vai trò tự đặt tên) xuống dòng trong bề rộng popover thay vì tràn ra ngoài.
                    className="h-auto min-h-8 max-w-full py-1 text-left whitespace-normal [overflow-wrap:anywhere]"
                    aria-pressed={pressed}
                    onClick={() => onChange(pressed ? '' : option.value)}
                  >
                    {option.label}
                  </Button>
                )
              })}
            </div>
          </FilterField>
        </div>
      )
    }
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={triggerId} className={FILTER_LABEL_CLASS}>
          {label}
        </label>
        <Select {...selectProps}>
          <SelectTrigger
            id={triggerId}
            aria-label={label}
            title={selectedLabel}
            className="w-full max-w-none"
          >
            <SelectValue />
          </SelectTrigger>
          {content}
        </Select>
      </div>
    )
  }

  return (
    <Select {...selectProps}>
      <SelectTrigger aria-label={label} title={selectedLabel} className={cn('max-w-56', className)}>
        <SelectValue />
      </SelectTrigger>
      {content}
    </Select>
  )
}
