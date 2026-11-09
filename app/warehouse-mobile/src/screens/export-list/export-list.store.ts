import { create } from 'zustand'

import type {
  ExportFormSearchField,
  ExportFormStatus,
  ExportFormType,
} from '@/entities/export-form'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  createChipFilterSlice,
  initialChipFilters,
  type ChipFilterActions,
  type ChipFilters,
} from '@/features/list-filters'

/** Bộ lọc trạng thái của danh sách; `ALL` = không gửi tham số `status`. */
export type ExportStatusFilter = ExportFormStatus | 'ALL'

type ExportListState = ChipFilters &
  ChipFilterActions & {
    /** Ô tìm kiếm (iOS: UISearchController tự giữ chữ; Android: ô trong danh sách). */
    query: string
    field: ExportFormSearchField
    /**
     * `null` = người dùng chưa chọn: màn lấy mặc định theo quyền lúc mở tab lần đầu trong phiên
     * (`defaultExportStatus`) — hết phiên `reset()` đưa về `null` nên người đăng nhập sau được tính lại.
     */
    status: ExportStatusFilter | null
    /** Loại xuất (bộ lọc riêng của tab Xuất, ngoài lát chip dùng chung); `null` = mọi loại. */
    type: ExportFormType | null
    setQuery: (query: string) => void
    setField: (field: ExportFormSearchField) => void
    setStatus: (status: ExportStatusFilter) => void
    setType: (type: ExportFormType | null) => void
    /** Đổi kho: chỉ xoá ô tìm kiếm (và trường tìm), giữ trạng thái và bộ lọc. */
    clearSearch: () => void
    reset: () => void
  }

const initial = {
  query: '',
  field: 'code' as ExportFormSearchField,
  status: null as ExportStatusFilter | null,
  type: null as ExportFormType | null,
  ...initialChipFilters,
}

/** Người duyệt (EXPORT_FORM_CONFIRM) mở tab thấy phiếu chờ mình duyệt; người lập thấy Nháp. */
export const defaultExportStatus = (canConfirm: boolean): ExportFormStatus =>
  canConfirm ? 'PENDING' : 'DRAFT'

/**
 * Ô tìm kiếm + trường tìm + trạng thái + Loại + bộ lọc chip của tab Xuất. Store (không phải state của
 * màn) vì sheet Lọc là route riêng. Xoá hết khi phiên kết thúc (`session-wiring`).
 */
export const useExportListFilter = create<ExportListState>((set) => ({
  ...initial,
  ...createChipFilterSlice(set),
  setQuery: (query) => set({ query }),
  setField: (field) => set({ field }),
  setStatus: (status) => set({ status }),
  setType: (type) => set({ type }),
  clearSearch: () => set({ query: '', field: initial.field }),
  reset: () => set({ ...initial }),
}))

/** Đổi kho → xoá ô tìm kiếm (đồng bộ, không có khung hình mang từ khoá của kho cũ). Trả hàm gỡ. */
export function resetExportListOnWarehouseChange(): () => void {
  return useWarehouseStore.subscribe((state, prev) => {
    if (state.current?.slug !== prev.current?.slug) useExportListFilter.getState().clearSearch()
  })
}
