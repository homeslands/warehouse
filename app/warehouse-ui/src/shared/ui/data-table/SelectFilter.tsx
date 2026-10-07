import { XIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { CHIP_FRAME, CHIP_INNER, useFilterDisplay } from './filter-display'

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

  return (
    <Select {...selectProps}>
      <SelectTrigger aria-label={label} title={selectedLabel} className={cn('max-w-56', className)}>
        <SelectValue />
      </SelectTrigger>
      {content}
    </Select>
  )
}
