import type { StoreApi, UseBoundStore } from 'zustand'

import type { PersonFilter } from './people'
import type { TimeFilter } from './time-filter'

export type ChipFilters = {
  /** Thời gian tạo: ID mốc nhanh (tính ngày lúc dựng query) hoặc khoảng tự chọn; `null` = mọi lúc. */
  time: TimeFilter
  /** Người lập / người xác nhận; `null` = tất cả. */
  requester: PersonFilter | null
  approver: PersonFilter | null
}

export type ChipFilterActions = {
  setTime: (time: TimeFilter) => void
  setRequester: (person: PersonFilter | null) => void
  setApprover: (person: PersonFilter | null) => void
  /** "Xoá lọc": bỏ thời gian + người lập + người xác nhận; không đụng field khác của store (tìm kiếm, trạng thái…). */
  clearChips: () => void
}

/** Store zustand của một tab có chứa lát bộ lọc chip (UI của feature chỉ đọc/ghi qua kiểu này). */
export type ChipFilterStore = UseBoundStore<StoreApi<ChipFilters & ChipFilterActions>>

export const initialChipFilters: ChipFilters = { time: null, requester: null, approver: null }

/** Lát zustand ghép vào store của từng tab: `create((set) => ({ ...createChipFilterSlice(set), … }))`. */
export function createChipFilterSlice(
  set: (partial: Partial<ChipFilters>) => void,
): ChipFilters & ChipFilterActions {
  return {
    ...initialChipFilters,
    setTime: (time) => set({ time }),
    setRequester: (requester) => set({ requester }),
    setApprover: (approver) => set({ approver }),
    clearChips: () => set({ ...initialChipFilters }),
  }
}
