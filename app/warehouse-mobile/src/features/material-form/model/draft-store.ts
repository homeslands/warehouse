import { create } from 'zustand'

import type { MaterialRef } from '@/entities/material'

export type MaterialDraftField = 'type' | 'baseUnit' | 'unit'

type State = {
  type: MaterialRef | null
  baseUnit: MaterialRef | null
  unit: MaterialRef | null
  /** Mã đọc được từ màn con `scan` (đã trim), form vật tư nhận rồi đặt lại `null`. */
  scannedCode: string | null
  /** Kho sẽ gắn khi tạo vật tư (slug, theo thứ tự tick). `null` = form chưa khởi tạo; màn con `warehouses` ghi. */
  warehouses: string[] | null
  set: (field: MaterialDraftField, ref: MaterialRef) => void
  setScannedCode: (code: string | null) => void
  /** Bên bán sẽ gắn khi tạo vật tư (slug, theo thứ tự tick). `null` = form chưa khởi tạo; màn con `suppliers` ghi. */
  suppliers: string[] | null
  setWarehouses: (slugs: string[]) => void
  setSuppliers: (slugs: string[]) => void
  reset: () => void
}

const EMPTY = {
  type: null,
  baseUnit: null,
  unit: null,
  scannedCode: null,
  warehouses: null,
  suppliers: null,
}

/**
 * Giá trị người dùng chọn ở màn `pick` (con của sheet) để trả về form gốc: màn `pick` ghi, form đọc.
 * `reset()` khi mở sheet (mount màn index) và khi đổi phiên.
 */
export const useMaterialDraft = create<State>((set) => ({
  ...EMPTY,
  set: (field, ref) => set({ [field]: ref }),
  setScannedCode: (scannedCode) => set({ scannedCode }),
  setWarehouses: (warehouses) => set({ warehouses }),
  setSuppliers: (suppliers) => set({ suppliers }),
  reset: () => set(EMPTY),
}))
