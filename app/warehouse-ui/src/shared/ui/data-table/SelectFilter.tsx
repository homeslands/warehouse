import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

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
  return (
    <Select
      value={value === '' ? ALL : value}
      onValueChange={(next) => onChange(next === ALL ? '' : next)}
    >
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value === '' ? ALL : option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
