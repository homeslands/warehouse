/**
 * `WarehouseResponseDto` của backend (kế thừa `BaseResponseDto`: `slug`, `createdAt`, `updatedAt`).
 * Trường backend LUÔN trả khai bắt buộc dù Swagger ghi tuỳ chọn. `managerSlug`/`managerPhonenumber`
 * mới thật sự tuỳ chọn — kho chưa phân công thì không có. Backend KHÔNG trả tên quản lý, chỉ SĐT.
 *
 * KHÔNG có `version`: từ `WMS-10-be(2)` danh mục (kho, cửa hàng, vật tư…) kế thừa `Base`, chỉ các
 * loại phiếu còn optimistic lock. Hệ quả: hai người sửa cùng lúc thì người lưu sau ghi đè.
 */
export type Warehouse = {
  slug: string
  createdAt: string
  updatedAt: string
  name: string
  code: string
  address: string
  phonenumber?: string
  description?: string
  isActive: boolean
  managerSlug?: string
  managerPhonenumber?: string
}

/** Giá trị của form tạo/sửa kho. Gán quản lý đi endpoint riêng nên KHÔNG nằm ở đây. */
export type WarehouseInput = {
  code: string
  name: string
  address: string
  phonenumber?: string
  description?: string
  isActive: boolean
}

/**
 * PATCH của backend là partial thật: field không gửi giữ nguyên giá trị cũ. Nhờ vậy "ngừng/mở hoạt
 * động" chỉ cần gửi `{ isActive }`.
 */
export type WarehouseUpdateInput = Partial<WarehouseInput>

/** `managerSlug: null` = bỏ gán quản lý. Bỏ field hay gửi `''` đều bị backend từ chối (100513). */
export type AssignWarehouseManagerInput = { managerSlug: string | null }

export type WarehouseFilters = {
  isActive?: boolean
  managerSlug?: string
  /** `false` = chỉ kho chưa có quản lý. Backend bỏ qua nếu đã truyền `managerSlug`. */
  hasManager?: boolean
  /**
   * Tìm theo từ khoá. Backend CHƯA có tham số này — chỉ được gửi khi
   * `BACKEND_SUPPORTS.search` bật (`shared/api/backend-capabilities.ts`).
   */
  search?: string
}

/** Bộ lọc của `GET /warehouses/mine` — backend chỉ nhận `isActive` (không `managerSlug`, `hasManager`). */
export type MyWarehouseFilters = {
  isActive?: boolean
}
