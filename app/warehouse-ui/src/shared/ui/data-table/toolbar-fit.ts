import { useLayoutEffect, useRef, useState } from 'react'

/** Khớp `sm:min-w-64` của ô tìm trong `ListToolbar` — ô tìm không co dưới mức này. */
export const SEARCH_MIN_WIDTH = 256
/** Khớp `gap-2` của `ListToolbar`. */
export const TOOLBAR_GAP = 8

/**
 * Bề rộng cần để ô tìm (ở mức tối thiểu) + các bộ lọc + nút hành động nằm trên MỘT hàng. Không có bộ lọc
 * → 0: không có gì để gom, thanh luôn "vừa".
 */
export function requiredToolbarWidth({
  search,
  filters,
  actions,
  gap,
}: {
  search: number
  filters: number[]
  actions: number
  gap: number
}): number {
  if (filters.length === 0) return 0
  const filtersWidth = filters.reduce((sum, w) => sum + w, 0) + gap * (filters.length - 1)
  return (search > 0 ? search + gap : 0) + filtersWidth + (actions > 0 ? gap + actions : 0)
}

/**
 * Thanh có đủ chỗ cho mọi thứ trên một hàng không — đo theo chỗ THẬT của thanh (trừ sidebar), không theo
 * khổ cửa sổ: laptop 1.024–1.366px có sidebar thì thanh hẹp hơn nhiều so với cửa sổ.
 *
 * Bộ lọc chỉ đo được khi đang nằm thẳng trên thanh; lúc đã gom thì dùng số đo lần trước để biết khi nào
 * nới rộng đủ để bung lại. `useLayoutEffect` nên lần đo đầu xảy ra trước khi vẽ — không nháy hàng thứ hai.
 * Không có `ResizeObserver` hoặc thanh chưa có bề rộng (jsdom) → coi như vừa.
 */
export function useToolbarFit({ enabled, hasSearch }: { enabled: boolean; hasSearch: boolean }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const filtersRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const needed = useRef<number | null>(null)
  const [fits, setFits] = useState(true)

  useLayoutEffect(() => {
    const row = rowRef.current
    if (!enabled || !row || typeof ResizeObserver === 'undefined') return
    const check = () => {
      // Chưa dàn trang (jsdom, phần tử ẩn) → bề rộng 0: không đủ dữ kiện, giữ nguyên.
      if (row.clientWidth === 0) return
      const inline = filtersRef.current
      if (inline) {
        needed.current = requiredToolbarWidth({
          search: hasSearch ? SEARCH_MIN_WIDTH : 0,
          filters: Array.from(inline.children).map((child) => (child as HTMLElement).offsetWidth),
          actions: actionsRef.current?.offsetWidth ?? 0,
          gap: TOOLBAR_GAP,
        })
      }
      if (needed.current !== null) setFits(needed.current <= row.clientWidth)
    }
    const observer = new ResizeObserver(check)
    observer.observe(row)
    if (filtersRef.current) observer.observe(filtersRef.current)
    check()
    return () => observer.disconnect()
  }, [enabled, hasSearch, fits])

  return { rowRef, filtersRef, actionsRef, fits }
}
