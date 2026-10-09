import { SlidersHorizontalIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { useIsMobile } from '@/shared/lib/use-mobile'
import { FilterDisplayProvider } from './filter-display'
import { useToolbarFit } from './toolbar-fit'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'

type ListToolbarProps = {
  /** Trái: ô tìm kiếm (nếu có). */
  search?: ReactNode
  /** Phải, trước nút hành động: bộ lọc. */
  filters?: ReactNode
  /** Phải ngoài cùng: nút hành động (Tạo, Xuất...). */
  actions?: ReactNode
  /** Số bộ lọc đang áp dụng — hiện thành số trên nút "Bộ lọc" khi đã gom (desktop). */
  activeFilterCount?: number
  /** Có → nút "Xoá bộ lọc" (popover desktop / cuối hàng chip mobile), chỉ hiện khi đang có bộ lọc áp dụng. */
  onClearFilters?: () => void
}

/**
 * Khung bố cục thanh trên bảng. Không giữ trạng thái — bộ lọc sống trên URL (useListParams).
 *
 * - **Desktop vừa một hàng**: ô tìm bên trái; bộ lọc rồi nút hành động dồn phải.
 * - **Desktop không vừa** (laptop có sidebar — `toolbar-fit.ts` đo chỗ thật): gom bộ lọc vào nút "Bộ lọc (n)"
 *   mở popover; thanh luôn một hàng, nút hành động không rơi xuống hàng riêng.
 * - **Mobile < 768px**: hàng 1 ô tìm + nút hành động; hàng 2 bộ lọc dạng **chip lướt ngang** (kiểu
 *   Shopee/Google Maps) — thấy ngay đang lọc gì, đổi một bộ lọc chỉ một chạm. Mép phải mờ khi còn chip phía sau.
 *   Không có bộ lọc thì chỉ còn hàng 1.
 */
export function ListToolbar({
  search,
  filters,
  actions,
  activeFilterCount = 0,
  onClearFilters,
}: ListToolbarProps) {
  const { t } = useTranslation(['common'])
  const isMobile = useIsMobile()
  const { rowRef, filtersRef, actionsRef, fits } = useToolbarFit({
    enabled: Boolean(filters) && !isMobile,
    hasSearch: Boolean(search),
  })
  const canClear = onClearFilters !== undefined && activeFilterCount > 0

  if (isMobile && filters) {
    const chips = (
      <ChipRow label={t('common:filters')} bleedRight={Boolean(search)}>
        <FilterDisplayProvider value="chip">{filters}</FilterDisplayProvider>
        {canClear && (
          <Button
            variant="ghost"
            className="text-muted-foreground rounded-full"
            onClick={onClearFilters}
          >
            {t('common:clearFilters')}
          </Button>
        )}
      </ChipRow>
    )
    // Không có ô tìm: nút hành động đứng cuối hàng chip thay vì chiếm nguyên một hàng riêng.
    if (!search) {
      return (
        <div data-slot="toolbar-row" className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{chips}</div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )
    }
    return (
      <div className="space-y-2">
        <div data-slot="toolbar-row" className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{search}</div>
          {actions && <div className="ml-auto shrink-0">{actions}</div>}
        </div>
        {chips}
      </div>
    )
  }

  // Mobile, chỉ ô tìm + nút hành động (không bộ lọc): một hàng như khi có chip — đừng để nút rơi xuống hàng riêng.
  if (isMobile && search && actions) {
    return (
      <div data-slot="toolbar-row" className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{search}</div>
        <div className="shrink-0">{actions}</div>
      </div>
    )
  }

  const collapse = Boolean(filters) && !fits

  return (
    <div ref={rowRef} data-slot="toolbar-row" className="flex flex-wrap items-center gap-2">
      {search && (
        <div
          // Ô tìm không bị bóp tới mức cắt placeholder (khớp SEARCH_MIN_WIDTH khi đo); đã gom bộ lọc thì
          // nhường chỗ, co xuống 10rem để nút Bộ lọc + nút hành động vẫn cùng hàng.
          className={cn(
            'w-full min-w-0 sm:w-auto sm:flex-1',
            collapse ? 'sm:min-w-40' : 'sm:min-w-64',
          )}
        >
          {search}
        </div>
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {collapse ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <SlidersHorizontalIcon aria-hidden />
                {t('common:filters')}
                {activeFilterCount > 0 && (
                  <Badge
                    variant="secondary"
                    aria-label={t('common:filtersActive', { count: activeFilterCount })}
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" aria-label={t('common:filters')} className="w-64 gap-3 p-3">
              <div className="flex flex-col items-stretch gap-3 *:w-full [&_[data-slot=select-trigger]]:max-w-none">
                {filters}
              </div>
              {canClear && (
                <Button variant="ghost" size="sm" className="self-end" onClick={onClearFilters}>
                  {t('common:clearFilters')}
                </Button>
              )}
            </PopoverContent>
          </Popover>
        ) : (
          filters && (
            <div ref={filtersRef} className="flex flex-wrap items-center justify-end gap-2">
              {filters}
            </div>
          )
        )}
        {actions && <div ref={actionsRef}>{actions}</div>}
      </div>
    </div>
  )
}

/**
 * Hàng chip lướt ngang: tràn ra sát mép màn (bù lại `p-4 sm:p-6` của `<main>`) để chip cuộn tới mép, ẩn thanh
 * cuộn, mép phải mờ khi còn chip phía sau. Bộ lọc không phải chip (Combobox, ô tick) được bo tròn cho đồng bộ.
 */
function ChipRow({
  label,
  bleedRight,
  children,
}: {
  label: string
  /** Tràn cả mép phải — tắt khi nút hành động đứng cùng hàng bên phải. */
  bleedRight: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [])

  return (
    <div className={cn('relative -ml-4 sm:-ml-6', bleedRight && '-mr-4 sm:-mr-6')}>
      <div
        ref={ref}
        role="group"
        aria-label={label}
        className={cn(
          'flex gap-2 overflow-x-auto pl-4 [scrollbar-width:none] sm:pl-6 [&::-webkit-scrollbar]:hidden *:shrink-0 [&_[data-slot=button]]:rounded-full [&_[data-slot=popover-trigger]]:rounded-full [&>label]:h-9 [&>label]:rounded-full [&>label]:border [&>label]:border-input [&>label]:px-3 [&>label]:whitespace-nowrap',
          bleedRight && 'pr-4 sm:pr-6',
        )}
      >
        {children}
      </div>
      {more && (
        <div
          aria-hidden
          className="from-background pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l to-transparent"
        />
      )}
    </div>
  )
}
