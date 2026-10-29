import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import {
  caretAfterNormalize,
  formatMoneyText,
  moneySeparators,
  moneyTextToNumber,
  normalizeMoneyText,
} from '@/shared/lib/money-input'
import { Input } from '@/shared/ui/input'

type MoneyInputProps = Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'inputMode' | 'min' | 'max'
> & {
  value: number | undefined
  onChange: (value: number | undefined) => void
  /** Số lẻ tối đa — mặc định 2 (cột tiền `DECIMAL(18,2)`); 0 = chỉ số nguyên. */
  maxFractionDigits?: number
  /** Hậu tố "₫" trong ô (mặc định có). */
  currency?: boolean
}

/**
 * Ô nhập tiền: định dạng ngay khi gõ theo ngôn ngữ (vi `1.500.000,5`, en `1,500,000.5`), dán `1,500,000` hay
 * `1.500.000` đều hiểu là một triệu rưỡi (luật ở `shared/lib/money-input.ts`). Giá trị ra là `number | undefined` như
 * `NumberInput` — ô trống là `undefined`, không bao giờ `NaN`. Con trỏ giữ đúng chỗ khi dấu nhóm được thêm / bớt.
 * Khác `NumberInput` (coi `.` và `,` đều là dấu thập phân): đừng dùng `NumberInput` cho tiền.
 */
export function MoneyInput({
  value,
  onChange,
  maxFractionDigits = 2,
  currency = true,
  onBlur,
  className,
  ref,
  ...props
}: MoneyInputProps) {
  const { i18n } = useTranslation()
  const sep = moneySeparators(i18n.resolvedLanguage)
  const [text, setText] = useState(() => formatMoneyText(value, sep, maxFractionDigits))
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pendingCaret = useRef<number | null>(null)

  // Giá trị đổi từ ngoài (form.reset, setValue) hoặc đổi ngôn ngữ → hiện theo. Bỏ qua khi chuỗi đang gõ đã biểu diễn
  // đúng giá trị đó ("1.500," vẫn là 1500) để không nhảy con trỏ giữa lúc gõ.
  useEffect(() => {
    setText((current) => {
      const reformatted = normalizeMoneyText(current, sep, maxFractionDigits)
      return moneyTextToNumber(reformatted, sep) === value && reformatted === current
        ? current
        : formatMoneyText(value, sep, maxFractionDigits)
    })
    // `sep` suy từ ngôn ngữ — phụ thuộc vào ngôn ngữ thay vì object mới mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, i18n.resolvedLanguage, maxFractionDigits])

  useLayoutEffect(() => {
    const caret = pendingCaret.current
    if (caret === null || !inputRef.current) return
    pendingCaret.current = null
    if (document.activeElement === inputRef.current)
      inputRef.current.setSelectionRange(caret, caret)
  }, [text])

  const setRefs = (el: HTMLInputElement | null) => {
    inputRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as { current: HTMLInputElement | null }).current = el
  }

  return (
    <div className="relative">
      <Input
        {...props}
        ref={setRefs as Ref<HTMLInputElement>}
        type="text"
        inputMode={maxFractionDigits > 0 ? 'decimal' : 'numeric'}
        className={cn(currency && 'pr-8', className)}
        value={text}
        onChange={(event) => {
          const raw = event.target.value
          const next = normalizeMoneyText(raw, sep, maxFractionDigits)
          pendingCaret.current = caretAfterNormalize(
            raw,
            event.target.selectionStart ?? raw.length,
            next,
            sep,
            maxFractionDigits,
          )
          setText(next)
          const n = moneyTextToNumber(next, sep)
          if (n !== value) onChange(n)
        }}
        onBlur={(event) => {
          // Bỏ dấu thập phân treo / số 0 thừa ở phần lẻ: "1.500," → "1.500", "1,50" → "1,5".
          setText(formatMoneyText(moneyTextToNumber(text, sep), sep, maxFractionDigits))
          onBlur?.(event)
        }}
      />
      {currency && (
        <span
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm"
        >
          ₫
        </span>
      )}
    </div>
  )
}
