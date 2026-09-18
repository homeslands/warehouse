import { useEffect, useState, type ComponentProps } from 'react'
import { Input } from '@/shared/ui/input'

type NumberInputProps = Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'min' | 'max' | 'inputMode'
> & {
  value: number | undefined
  onChange: (value: number | undefined) => void
  min?: number
  max?: number
  /** Chỉ nhận số nguyên: ký tự thập phân bị bỏ qua ngay khi gõ. */
  integer?: boolean
}

const INTEGER_TEXT = /^-?\d*$/
const DECIMAL_TEXT = /^-?\d*([.,]\d*)?$/

/** Chuỗi đang gõ → số. Chưa thành số ("", "-", ".") → undefined; KHÔNG BAO GIỜ trả NaN. */
function toNumber(text: string): number | undefined {
  if (text.trim() === '') return undefined
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function clamp(n: number, min: number | undefined, max: number | undefined): number {
  if (min !== undefined && n < min) return min
  if (max !== undefined && n > max) return max
  return n
}

/**
 * Ô số cho form: giá trị là `number | undefined`, ô trống là `undefined` (không phải 0, không phải
 * NaN). Dùng `type="text"` + `inputMode` thay vì `type="number"`: ô number của trình duyệt trả ""
 * cho cả "1e" lẫn "1,5" và đổi giá trị khi cuộn chuột. `min`/`max` áp khi rời ô.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  integer = false,
  onBlur,
  ...props
}: NumberInputProps) {
  const [text, setText] = useState(() => (value === undefined ? '' : String(value)))

  // Giá trị đổi từ ngoài (form.reset, setValue) → hiện theo. Bỏ qua khi chuỗi đang gõ đã biểu diễn
  // đúng giá trị đó ("1." vẫn là 1) để không nhảy con trỏ giữa lúc gõ.
  useEffect(() => {
    setText((current) =>
      toNumber(current) === value ? current : value === undefined ? '' : String(value),
    )
  }, [value])

  return (
    <Input
      {...props}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={text}
      onChange={(event) => {
        const next = event.target.value
        if (!(integer ? INTEGER_TEXT : DECIMAL_TEXT).test(next)) return
        setText(next)
        onChange(toNumber(next))
      }}
      onBlur={(event) => {
        const n = toNumber(text)
        if (n === undefined) {
          setText('')
        } else {
          const clamped = clamp(n, min, max)
          setText(String(clamped))
          if (clamped !== n) onChange(clamped)
        }
        onBlur?.(event)
      }}
    />
  )
}
