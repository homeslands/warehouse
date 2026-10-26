import { ChevronDownIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react'
import {
  useCallback,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react'
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

export type ComboboxOption = {
  value: string
  label: string
  /** Hiện mờ, không chọn được (vd. vật tư hết hàng). */
  disabled?: boolean
}

type ComboboxProps = Omit<ComponentProps<'button'>, 'value' | 'onChange'> & {
  options: ComboboxOption[]
  value: string | undefined
  onChange: (value: string | undefined) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  /**
   * Nội dung cố định cuối danh sách (sau kết quả / câu "không có kết quả") — vd "＋ Thêm vật tư vào kho…".
   * Nhận chữ đang gõ trong ô tìm và hàm đóng danh sách.
   */
  footer?: (search: string, close: () => void) => ReactNode
  /**
   * Có → danh sách vẽ theo nhóm (có tiêu đề nếu `heading` không rỗng) thay cho `options`. `options` vẫn là bảng tra
   * cứu nhãn của giá trị đang chọn, nên nên chứa mọi mục (kể cả mục không nằm trong nhóm nào đang vẽ).
   */
  groups?: { heading: string; options: ComboboxOption[] }[]
  /** Báo chữ đang gõ trong ô tìm (kể cả `''` khi chọn / đóng) — cho tìm phía server. */
  onSearchChange?: (search: string) => void
  /** Danh sách do server lọc: tắt bộ lọc tại chỗ của cmdk. */
  serverFiltered?: boolean
  /** Đang tải kết quả: hiện `loadingText` thay cho câu "không có kết quả". */
  isLoading?: boolean
  loadingText?: string
  /** Mở sẵn lúc dựng (vd. ô vừa hiện ra sau khi bấm "đổi bên bán"). */
  defaultOpen?: boolean
  /** Báo danh sách mở / đóng — kể cả đóng không chọn gì (Esc, bấm ra ngoài) và đóng sau khi chọn. */
  onOpenChange?: (open: boolean) => void
  /**
   * Có → lúc mở, danh sách có mép trái và bề rộng trùng phần tử neo (đo lúc mở; vẫn không hẹp hơn 18rem) thay vì
   * rộng bằng nút mở — vd. ô vật tư trong một dòng hẹp mà danh sách cần rộng bằng cả bảng dòng.
   */
  widthAnchor?: RefObject<HTMLElement | null>
  /** Có → thay nhãn mặc định trong mỗi mục (vẫn giữ `value` / tìm theo nhãn / dấu tích). */
  renderOption?: (option: ComboboxOption) => ReactNode
  /** Lớp thêm cho `CommandList` (vd. `max-h-[60vh]` thay trần mặc định `max-h-72`). */
  listClassName?: string
  /**
   * Chỗ tối thiểu (px) cần dưới ô chọn trước khi mở mà không cuộn ô lên giữa. Mặc định 320 (khớp `max-h-72`); danh sách
   * cao hơn (`listClassName`) thì truyền theo chiều cao đó.
   */
  minListSpace?: number
  /** Mũi tên ở nút mở: `updown` (⇅, mặc định) hoặc `down` (⌄ — dùng trong bộ lọc cho thống nhất với `Select`). */
  chevron?: 'updown' | 'down'
}

/**
 * Chỗ cần dưới ô chọn để danh sách hiện đủ (~ô tìm + `max-h-72` của `CommandList`). Ít hơn → cuộn ô chọn lên
 * giữa vùng nhìn thấy TRƯỚC khi mở: ô ở cuối form (dòng vật tư cuối sheet) nếu không thì chỉ còn vài mục hiện ra.
 */
const LIST_SPACE_PX = 320 // mặc định của `minListSpace`

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
  footer,
  groups,
  onSearchChange,
  serverFiltered = false,
  isLoading = false,
  loadingText,
  defaultOpen = false,
  onOpenChange,
  widthAnchor,
  renderOption,
  listClassName,
  minListSpace = LIST_SPACE_PX,
  chevron = 'updown',
  disabled,
  className,
  ref,
  ...triggerProps
}: ComboboxProps) {
  const { t } = useTranslation(['common'])
  const [open, setOpenState] = useState(defaultOpen)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
  // Điều khiển ô tìm để đưa chữ đang gõ cho `footer`; xoá khi đóng (cmdk unmount lúc đóng nên trước đây tự trống).
  const [search, setSearchState] = useState('')
  const setSearch = (next: string) => {
    setSearchState(next)
    onSearchChange?.(next)
  }
  // Hình học danh sách theo `widthAnchor`, đo mỗi lần mở (khung có thể đã đổi cỡ từ lần trước).
  const [anchorBox, setAnchorBox] = useState<{ offset: number; width: number } | null>(null)
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
  const clearable = selected !== undefined && !disabled
  const searchText = searchPlaceholder ?? t('common:searchPlaceholder')
  const drawn = groups ?? [{ heading: '', options }]

  return (
    // Nút xoá nằm TRONG khung ô (đè lên mép phải nút mở, trước mũi tên) thay vì một nút riêng bên cạnh: ô hẹp trong bảng
    // (dòng phiếu nhập) không mất thêm ~2rem. Không lồng <button> trong <button> được nên đặt tuyệt đối trên lớp vỏ.
    // `min-w-0`: lớp vỏ là con của lưới (FormItem / cột form) — mặc định `min-width: auto` = độ dài nhãn đầy đủ, nhãn dài
    // (tên NCC 255 ký tự) đẩy ô tràn sang cột bên cạnh thay vì cắt "…".
    <div className={cn('relative flex min-w-0 items-center', className)}>
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
            window.innerHeight - trigger.getBoundingClientRect().bottom < minListSpace
          )
            trigger.scrollIntoView({ block: 'center' })
          const anchor = widthAnchor?.current
          if (next && trigger && anchor) {
            const box = anchor.getBoundingClientRect()
            setAnchorBox({
              offset: box.left - trigger.getBoundingClientRect().left,
              width: box.width,
            })
          } else if (next) setAnchorBox(null)
          if (!next) setSearch('')
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
            className="min-w-0 flex-1 justify-between font-normal"
            {...triggerProps}
            ref={setTriggerRef}
          >
            {selected ? (
              // Chừa chỗ cho nút xoá đè lên mép phải (đặt tuyệt đối, xem dưới) để nhãn dài cắt "…" trước nó.
              <span className={cn('truncate', clearable && 'mr-7')}>{selected.label}</span>
            ) : (
              <span className="text-muted-foreground truncate">
                {placeholder ?? t('common:selectPlaceholder')}
              </span>
            )}
            {chevron === 'down' ? (
              <ChevronDownIcon className="opacity-50" aria-hidden />
            ) : (
              <ChevronsUpDownIcon className="opacity-50" aria-hidden />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          // Không bao giờ cao hơn chỗ trống thật (Radix tính theo phía đang mở): phần dư cuộn trong danh sách
          // thay vì tràn ra khỏi màn hình. `min-h-0` để Command / CommandList co lại được trong khung flex.
          // Rộng bằng nút mở nhưng không hẹp hơn 18rem: ô trong bảng (dòng phiếu nhập) hẹp, danh sách bóp theo sẽ cắt
          // chữ ô tìm và câu "không có kết quả".
          className="max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) min-w-72 p-0"
          align="start"
          alignOffset={anchorBox?.offset}
          style={anchorBox ? { width: anchorBox.width } : undefined}
          collisionPadding={8}
        >
          {/* cmdk gắn aria-labelledby của ô tìm vào `label` của Command (aria-label bị lấn át). */}
          <Command
            filter={filterOption}
            shouldFilter={!serverFiltered}
            label={searchText}
            className="min-h-0"
          >
            <CommandInput placeholder={searchText} value={search} onValueChange={setSearch} />
            <CommandList className={cn('min-h-0', listClassName)}>
              {isLoading ? (
                <div role="status" className="text-muted-foreground py-6 text-center text-sm">
                  {loadingText ?? t('common:loading')}
                </div>
              ) : (
                <CommandEmpty>{emptyText ?? t('common:noResults')}</CommandEmpty>
              )}
              {drawn.map((group, i) => (
                <CommandGroup key={`${i}-${group.heading}`} heading={group.heading || undefined}>
                  {group.options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      keywords={[option.label]}
                      disabled={option.disabled}
                      // CommandItem (shadcn) tự hiện dấu tích khi data-checked=true.
                      data-checked={option.value === value}
                      onSelect={() => {
                        onChange(option.value)
                        setSearch('')
                        setOpen(false)
                      }}
                    >
                      {/* Nhãn dài không khoảng trắng (tên vật tư / đơn vị) phải ngắt dòng, không bị cắt giữa chữ. */}
                      {renderOption ? (
                        renderOption(option)
                      ) : (
                        <span className="min-w-0 break-words">{option.label}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
            {footer && (
              <div data-slot="combobox-footer" className="border-t p-1">
                {footer(search, () => {
                  setSearch('')
                  setOpen(false)
                })}
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>
      {clearable && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-8 -translate-y-1/2"
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
