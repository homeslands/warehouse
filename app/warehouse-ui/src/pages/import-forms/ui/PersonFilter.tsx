import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { formatPersonLabel } from '@/shared/lib/person-name'
import { Combobox } from '@/shared/ui/Combobox'
import { FilterField } from '@/shared/ui/data-table/FilterField'
import { CHIP_FRAME, useFilterDisplay } from '@/shared/ui/data-table/filter-display'
import { useUser, useUsers, type User } from '@/entities/user'

const SEARCH_DEBOUNCE_MS = 300
/** Trang kết quả của một lần tìm — ô chọn không phân trang; người cần tìm thì gõ thêm. */
const RESULT_SIZE = 20

type Props = {
  /** Nhãn bộ lọc — tên cho screen reader, và chữ trên ô khi chưa chọn. */
  label: string
  /** Slug người đang lọc (từ URL). */
  value: string | undefined
  onChange: (slug: string | undefined) => void
  className?: string
}

/**
 * Một ô chọn người cho thanh lọc (Người lập / Người xác nhận), tìm phía server qua `GET /users`. Backend tìm
 * tên (`name`) và SĐT (`phonenumber`) riêng: toàn chữ số → `phonenumber`, còn lại → `name`. Người đang chọn có
 * thể không nằm trong trang kết quả (URL, hoặc đã gõ chữ khác) → lấy nhãn bằng `GET /users/{slug}`.
 */
export function PersonFilter({ label, value, onChange, className }: Props) {
  const { t } = useTranslation(['importForms', 'common'])
  const display = useFilterDisplay()
  const chip = display === 'chip'
  const popover = display === 'popover'
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [search])

  const digits = debounced.replace(/\s+/g, '')
  // Chỉ tải danh sách khi người dùng mở ô hoặc đang có chữ tìm — trang vừa mở không bắn `GET /users`.
  const { data, isFetching } = useUsers(
    {
      page: 1,
      size: RESULT_SIZE,
      ...(debounced === ''
        ? {}
        : /^\d+$/.test(digits)
          ? { phonenumber: digits }
          : { name: debounced }),
    },
    { enabled: open || search !== '' },
  )
  const selectedQuery = useUser(value ?? null, {
    placeholderData: data?.items.find((u) => u.slug === value),
  })
  const selectedUser = selectedQuery.data
  // Slug trên URL trỏ tới người không tải được (404 / đã xoá) → vẫn có một mục để hiện nút ✕ bỏ lọc.
  const unknownSelected = value !== undefined && !selectedUser && !selectedQuery.isPending

  // Nút ghi "Người lập: <người>" để hai ô không giống hệt nhau; danh sách xổ xuống chỉ ghi người.
  const { options, plainLabels } = useMemo(() => {
    const items: User[] = data?.items ?? []
    const all =
      selectedUser && !items.some((u) => u.slug === selectedUser.slug)
        ? [selectedUser, ...items]
        : items
    const plain = new Map<string, string>()
    const list = all.map((u) => {
      const person = formatPersonLabel(u)
      plain.set(u.slug, person)
      return { value: u.slug, label: popover ? person : `${label}: ${person}` }
    })
    if (unknownSelected && value !== undefined && !plain.has(value)) {
      const person = t('importForms:filterPersonUnknown')
      plain.set(value, person)
      list.unshift({ value, label: popover ? person : `${label}: ${person}` })
    }
    return { options: list, plainLabels: plain }
  }, [data, selectedUser, unknownSelected, value, label, popover, t])

  const selectedLabel = options.find((o) => o.value === value)?.label
  return (
    <FilterField label={label}>
      <div
        data-active={chip ? value !== undefined : undefined}
        className={cn(
          chip ? cn(CHIP_FRAME, 'w-44') : display === 'popover' ? 'w-full' : 'w-64 max-w-full',
          className,
        )}
      >
        <Combobox
          aria-label={label}
          className={cn(
            'w-full',
            chip &&
              '[&_[role=combobox]]:h-full [&_[role=combobox]]:rounded-full [&_[role=combobox]]:border-0 [&_[role=combobox]]:bg-transparent [&_[role=combobox]]:pl-3.5 [&_[role=combobox]]:shadow-none [&_[role=combobox]]:hover:bg-transparent',
            // Đã chọn: bỏ mũi tên, ✕ về cuối chip (như SelectFilter).
            chip &&
              value !== undefined &&
              '[&_[role=combobox]>svg]:hidden [&_button:not([role=combobox])]:right-1.5',
          )}
          // Hai ô cùng kiểu, nhãn người có thể giống hệt nhau (cùng một người lập và xác nhận) → `title` ghi rõ ô nào.
          title={
            selectedLabel ? `${label}: ${plainLabels.get(value ?? '') ?? selectedLabel}` : undefined
          }
          options={options}
          value={value}
          onChange={onChange}
          placeholder={popover ? t('common:anyone') : label}
          searchPlaceholder={t('importForms:filterPersonSearch')}
          serverFiltered
          renderOption={(option) => (
            <span className="min-w-0 break-words">
              {plainLabels.get(option.value) ?? option.label}
            </span>
          )}
          onOpenChange={setOpen}
          onSearchChange={setSearch}
          isLoading={isFetching && (data?.items.length ?? 0) === 0}
          chevron="down"
        />
      </div>
    </FilterField>
  )
}
