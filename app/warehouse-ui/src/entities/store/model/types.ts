/**
 * `StoreResponseDto` của backend. Trường backend LUÔN trả khai bắt buộc dù Swagger ghi tuỳ chọn.
 * `warehouseSlug`/`warehouseName` chỉ có khi cửa hàng đã được gán kho.
 *
 * KHÔNG có version — xem ghi chú ở Warehouse.
 */
export type Store = {
  slug: string
  createdAt: string
  updatedAt: string
  name: string
  code: string
  legalName: string
  taxCode: string
  invoiceAddress?: string
  phonenumber?: string
  email?: string
  address?: string
  isActive: boolean
  warehouseSlug?: string
  warehouseName?: string
}

/** Giá trị của form tạo/sửa cửa hàng. Gán kho đi endpoint riêng nên KHÔNG nằm ở đây. */
export type StoreInput = {
  code: string
  name: string
  legalName: string
  taxCode: string
  invoiceAddress?: string
  phonenumber?: string
  email?: string
  address?: string
  isActive: boolean
}

export type StoreUpdateInput = Partial<StoreInput>

/** `warehouseSlug: null` = gỡ gắn kết kho. Bỏ field hay gửi `''` đều bị từ chối (101017). */
export type AssignStoreWarehouseInput = { warehouseSlug: string | null }

/** Backend `GET /stores` mới chỉ lọc theo `isActive` — chưa lọc theo kho, chưa tìm theo tên/mã. */
export type StoreFilters = {
  isActive?: boolean
  /**
   * Tìm theo từ khoá. Backend CHƯA có tham số này — chỉ được gửi khi
   * `BACKEND_SUPPORTS.search` bật (`shared/api/backend-capabilities.ts`).
   */
  search?: string
}
