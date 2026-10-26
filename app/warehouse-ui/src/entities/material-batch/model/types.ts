/** 0 = hết hàng, 1 = còn hàng. */
export type MaterialBatchStatus = 0 | 1

/**
 * Lô vật tư (`GET /warehouses/:w/material-batches`). Số lượng tính theo đơn vị gốc của vật tư;
 * `availableQuantity = remainingQuantity - reservedQuantity` (phần phiếu xuất mới còn lấy được).
 * Lô không có `version`.
 */
export type MaterialBatch = {
  slug: string
  entryDate: string
  /** null = không có hạn dùng. */
  expiryDate: string | null
  quantity: number
  remainingQuantity: number
  reservedQuantity: number
  availableQuantity: number
  status: MaterialBatchStatus
  materialSlug: string
  materialCode: string
  materialName: string
  importFormSlug: string | null
  importFormCode: string | null
  warehouseSlug: string
}

/** Bộ lọc riêng của danh sách lô (page/size/sort/sortBy đi theo `ListParams`). */
export type MaterialBatchFilters = {
  materialSlug?: string
  status?: MaterialBatchStatus
  /** YYYY-MM-DD; chỉ lô hết hạn trước ngày này (lô không hạn bị loại). */
  expiryBefore?: string
}
