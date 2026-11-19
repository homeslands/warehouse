import { create } from 'zustand'

import type { MaterialRef } from '@/entities/material'

type MaterialFilterState = {
  /** `null` = mọi loại. */
  type: MaterialRef | null
  setType: (type: MaterialRef | null) => void
  /**
   * Mã quét được ở `/scan-catalog-material` mà không khớp vật tư nào: danh sách nhận một lần (điền vào ô
   * tìm) rồi xoá. `null` = không có gì chờ.
   */
  scannedQuery: string | null
  setScannedQuery: (query: string | null) => void
  reset: () => void
}

/**
 * Bộ lọc loại của danh sách Vật tư. Là store (không phải state của màn) vì sheet `/material-filter`
 * là một route riêng. Xoá khi phiên kết thúc (`session-wiring`); danh mục dùng chung mọi kho nên
 * KHÔNG xoá khi đổi kho.
 */
export const useMaterialFilter = create<MaterialFilterState>((set) => ({
  type: null,
  setType: (type) => set({ type }),
  scannedQuery: null,
  setScannedQuery: (scannedQuery) => set({ scannedQuery }),
  reset: () => set({ type: null, scannedQuery: null }),
}))
