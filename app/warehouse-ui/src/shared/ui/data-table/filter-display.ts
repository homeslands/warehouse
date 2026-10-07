import { createContext, useContext } from 'react'

/**
 * Bộ lọc đang hiện kiểu nào: `inline` — ô chọn đầy đủ trên thanh / trong popover; `chip` — chip gọn trong
 * hàng lướt ngang trên mobile (`ListToolbar`). `SelectFilter`, `DateRangeFilter` tự đổi giao diện theo đây:
 * chip chưa chọn ghi TÊN bộ lọc ("Vai trò ▾"), đã chọn ghi GIÁ TRỊ + nút ✕, nền màu nhấn (`data-active`).
 */
export type FilterDisplay = 'inline' | 'chip'

const FilterDisplayContext = createContext<FilterDisplay>('inline')

export const FilterDisplayProvider = FilterDisplayContext.Provider

export function useFilterDisplay(): FilterDisplay {
  return useContext(FilterDisplayContext)
}

/** Khung chip dùng chung: cao bằng các ô khác (h-9), bo tròn, nền nhấn khi đang bật, viền focus bao cả chip. */
export const CHIP_FRAME =
  'inline-flex h-9 shrink-0 items-center rounded-full border border-input bg-transparent data-[active=true]:border-primary/40 data-[active=true]:bg-primary/10 dark:bg-input/30 dark:data-[active=true]:bg-primary/20 has-[[data-slot=select-trigger]:focus-visible]:ring-3 has-[[data-slot=select-trigger]:focus-visible]:ring-ring/50 has-[[data-slot=button]:focus-visible]:ring-3 has-[[data-slot=button]:focus-visible]:ring-ring/50'

/** Phần bấm được bên trong chip: không tự vẽ viền focus — viền nằm ở cả khung chip (`CHIP_FRAME`). */
export const CHIP_INNER = 'focus-visible:border-0 focus-visible:ring-0'
