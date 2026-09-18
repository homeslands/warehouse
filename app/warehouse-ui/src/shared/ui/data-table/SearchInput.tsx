import { SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

export const SEARCH_DEBOUNCE_MS = 300

type SearchInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/**
 * Ô tìm cho màn danh sách: gõ → `onChange` sau 300 ms (không bắn request mỗi phím); nút xoá gọi
 * ngay. `value` đổi từ ngoài (Back, link) → ô hiện theo.
 */
export function SearchInput({ value, onChange, placeholder, className }: SearchInputProps) {
  const { t } = useTranslation(['common'])
  const [text, setText] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Giá trị vừa báo lên: `value` quay về đúng nó là tiếng vọng của chính ta, không phải thay đổi
  // từ ngoài — bỏ qua để không ghi đè chữ người dùng gõ thêm trong lúc đó.
  const lastEmitted = useRef(value)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value
      clearTimeout(timer.current)
      setText(value)
    }
  }, [value])

  useEffect(() => () => clearTimeout(timer.current), [])

  const emit = (next: string) => {
    lastEmitted.current = next
    onChangeRef.current(next)
  }

  return (
    <div className={cn('relative w-full max-w-xs', className)}>
      <SearchIcon
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        type="search"
        aria-label={placeholder ?? t('common:search')}
        placeholder={placeholder ?? t('common:search')}
        className="pr-8 pl-8 [&::-webkit-search-cancel-button]:appearance-none"
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => emit(next), SEARCH_DEBOUNCE_MS)
        }}
      />
      {text !== '' && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          aria-label={t('common:clearSearch')}
          onClick={() => {
            clearTimeout(timer.current)
            setText('')
            emit('')
          }}
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
}
