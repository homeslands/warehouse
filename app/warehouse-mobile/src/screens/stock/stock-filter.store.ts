import { create } from 'zustand'

import { useWarehouseStore } from '@/entities/warehouse'

export type StockLevelFilter = 'low' | 'high'

type StockFilterState = {
  /** Ô tìm kiếm (tên hoặc mã). Task quét mã ghi mã không tìm thấy vào đây. */
  query: string
  /** `undefined` = Tất cả. */
  level?: StockLevelFilter
  /** `undefined` = mọi loại. */
  typeSlug?: string
  setQuery: (query: string) => void
  setLevel: (level: StockLevelFilter | undefined) => void
  setTypeSlug: (typeSlug: string | undefined) => void
  /** "Xoá lọc": mức tồn + loại về mặc định, giữ ô tìm kiếm. */
  clearFilters: () => void
  reset: () => void
}

const initial = { query: '', level: undefined, typeSlug: undefined }

/**
 * Bộ lọc của tab Tồn kho. Là store (không phải state của màn) vì menu Lọc nằm ở header native, sheet
 * lọc của Android là một route riêng và màn quét mã cũng ghi vào ô tìm kiếm. Xoá khi đổi kho và khi phiên kết thúc (`session-wiring`).
 */
export const useStockFilter = create<StockFilterState>((set) => ({
  ...initial,
  setQuery: (query) => set({ query }),
  setLevel: (level) => set({ level }),
  setTypeSlug: (typeSlug) => set({ typeSlug }),
  clearFilters: () => set({ level: undefined, typeSlug: undefined }),
  reset: () => set({ ...initial }),
}))

/**
 * Đổi kho → xoá ô tìm kiếm và bộ lọc. Chạy đồng bộ trong lúc store kho đổi, nên React vẽ kho mới và
 * bộ lọc trống trong cùng một lần (không có khung hình nào mang từ khoá của kho cũ). Trả hàm gỡ.
 */
export function resetStockFilterOnWarehouseChange(): () => void {
  return useWarehouseStore.subscribe((state, prev) => {
    if (state.current?.slug !== prev.current?.slug) useStockFilter.getState().reset()
  })
}
