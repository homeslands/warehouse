import { ChevronsUpDownIcon, XIcon } from 'lucide-react'
import { useCallback, useRef, useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { matchesSearch } from '@/shared/lib/search-text'
import { Button } from '@/shared/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'

export type ComboboxOption = { value: string; label: string }

type ComboboxProps = Omit<ComponentProps<'button'>, 'value' | 'onChange'> & {
  options: ComboboxOption[]
  value: string | undefined
  onChange: (value: string | undefined) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
}

/**
 * Chỗ cần dưới ô chọn để danh sách hiện đủ (~ô tìm + `max-h-72` của `CommandList`). Ít hơn → cuộn ô chọn lên
 * giữa vùng nhìn thấy TRƯỚC khi mở: ô ở cuối form (dòng vật tư cuối sheet) nếu không thì chỉ còn vài mục hiện ra.
 */
const LIST_SPACE_PX = 320

function filterOption(value: string, search: string, keywords?: string[]): number {
  // Bỏ dấu: gõ "da nang" vẫn ra "Đà Nẵng" — bộ lọc mặc định của cmdk không làm việc này.
  return matchesSearch([value, ...(keywords ?? [])].join(' '), search) ? 1 : 0
}

/**
 * Chọn một giá trị trong danh sách có sẵn, lọc tại client. Props còn lại (id, aria-*) đi vào nút
 * mở — để `FormControl` nối được nhãn và lỗi.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
  className,
  ref,
  ...triggerProps
}: ComboboxProps) {
  const { t } = useTranslation(['common'])
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
  const selected = options.find((option) => option.value === value)
  const searchText = searchPlaceholder ?? t('common:searchPlaceholder')

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* modal: Popover portal ra ngoài Dialog; không modal thì RemoveScroll của Dialog chặn lăn chuột
          trong danh sách/lịch. */}
      <Popover
        modal
        open={open}
        onOpenChange={(next) => {
          const trigger = triggerRef.current
          if (
            next &&
            trigger &&
            window.innerHeight - trigger.getBoundingClientRect().bottom < LIST_SPACE_PX
          )
            trigger.scrollIntoView({ block: 'center' })
          setOpen(next)
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="flex-1 justify-between font-normal"
            {...triggerProps}
            ref={setTriggerRef}
          >
            {selected ? (
              <span className="truncate">{selected.label}</span>
            ) : (
              <span className="text-muted-foreground truncate">
                {placeholder ?? t('common:selectPlaceholder')}
              </span>
            )}
            <ChevronsUpDownIcon className="opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          // Không bao giờ cao hơn chỗ trống thật (Radix tính theo phía đang mở): phần dư cuộn trong danh sách
          // thay vì tràn ra khỏi màn hình. `min-h-0` để Command / CommandList co lại được trong khung flex.
          className="max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) p-0"
          align="start"
          collisionPadding={8}
        >
          {/* cmdk gắn aria-labelledby của ô tìm vào `label` của Command (aria-label bị lấn át). */}
          <Command filter={filterOption} label={searchText} className="min-h-0">
            <CommandInput placeholder={searchText} />
            <CommandList className="min-h-0">
              <CommandEmpty>{emptyText ?? t('common:noResults')}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label]}
                    // CommandItem (shadcn) tự hiện dấu tích khi data-checked=true.
                    data-checked={option.value === value}
                    onSelect={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                  >
                    {/* Nhãn dài không khoảng trắng (tên vật tư / đơn vị) phải ngắt dòng, không bị cắt giữa chữ. */}
                    <span className="min-w-0 break-words">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
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
