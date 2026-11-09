import { create } from 'zustand'

import type { ImportFormSearchField } from '@/entities/import-form'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  createChipFilterSlice,
  initialChipFilters,
  type ChipFilterActions,
  type ChipFilters,
} from '@/features/list-filters'

import type { ImportStatusFilter } from './list-filters'

export type { ImportStatusFilter } from './list-filters'
export type { PersonFilter } from '@/features/list-filters'

type ImportListState = ChipFilters &
  ChipFilterActions & {
    /** Ô tìm kiếm (iOS: UISearchController tự giữ chữ; Android: ô trong danh sách). */
    query: string
    field: ImportFormSearchField
    status: ImportStatusFilter
    setQuery: (query: string) => void
    setField: (field: ImportFormSearchField) => void
    setStatus: (status: ImportStatusFilter) => void
    /** Đổi kho: chỉ xoá ô tìm kiếm (và trường tìm), giữ trạng thái và bộ lọc chip. */
    clearSearch: () => void
    reset: () => void
  }

const initial = {
  query: '',
  field: 'code' as ImportFormSearchField,
  status: 'DRAFT' as ImportStatusFilter,
  ...initialChipFilters,
}

/**
 * Ô tìm kiếm + trường tìm + trạng thái + bộ lọc chip của tab Nhập. Store (không phải state của màn) vì
 * các sheet lọc là route riêng. Xoá hết khi phiên kết thúc (`session-wiring`).
 */
export const useImportListFilter = create<ImportListState>((set) => ({
  ...initial,
  // Lát bộ lọc chip dùng chung (`clearChips` = "Xoá lọc": giữ ô tìm kiếm và trạng thái, như web).
  ...createChipFilterSlice(set),
  setQuery: (query) => set({ query }),
  setField: (field) => set({ field }),
  setStatus: (status) => set({ status }),
  clearSearch: () => set({ query: '', field: initial.field }),
  reset: () => set({ ...initial }),
}))

/** Đổi kho → xoá ô tìm kiếm (đồng bộ, không có khung hình mang từ khoá của kho cũ). Trả hàm gỡ. */
export function resetImportListOnWarehouseChange(): () => void {
  return useWarehouseStore.subscribe((state, prev) => {
    if (state.current?.slug !== prev.current?.slug) useImportListFilter.getState().clearSearch()
  })
}
