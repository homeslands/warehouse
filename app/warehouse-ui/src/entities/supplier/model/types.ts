/**
 * `SupplierResponseDto` của backend. Trường tuỳ chọn backend trả `null` khi trống.
 * `createdAt`/`updatedAt` có dạng `Date.toString()` (không phải ISO). KHÔNG có `version`.
 */
export type Supplier = {
  slug: string
  createdAt: string
  updatedAt: string
  code: string
  name: string
  taxCode?: string | null
  phonenumber?: string | null
  email?: string | null
  address?: string | null
  contactPerson?: string | null
  note?: string | null
}

/** Giá trị của form tạo nhà cung cấp. */
export type SupplierInput = {
  code: string
  name: string
  taxCode?: string
  phonenumber?: string
  email?: string
  address?: string
  contactPerson?: string
  note?: string
}

export type SupplierUpdateInput = Partial<SupplierInput>

/**
 * Tham số lọc của `GET /suppliers` (ghép AND). Chỉ được gửi khi `BACKEND_SUPPORTS.supplierSearch` bật — việc
 * của trang.
 */
export type SupplierFilters = {
  /** Chứa chuỗi, khớp một trong name / contactPerson / email. */
  search?: string
  /** Khớp đúng (backend tự viết hoa). */
  code?: string
  /** Khớp đúng, dạng `0101234567` hoặc `0101234567-001`. */
  taxCode?: string
  /** Chứa chuỗi. */
  phonenumber?: string
}

/** Vật tư gắn với nhà cung cấp (`SupplierMaterialResponseDto`). */
export type SupplierMaterial = {
  slug: string
  createdAt: string
  updatedAt: string
  code: string
  name: string
  typeSlug?: string | null
  typeName?: string | null
  baseUnitSlug?: string | null
  baseUnitName?: string | null
}

/** Lọc `GET /suppliers/{slug}/materials` (WMS-13, ghép AND). Chỉ gửi khi `supplierMaterialFilters` bật. */
export type SupplierMaterialFilters = {
  /** Khớp đúng (backend tự viết hoa). */
  code?: string
  /** Chứa chuỗi. */
  name?: string
  /** ISO, theo `createdAt` của VẬT TƯ (không phải ngày gắn), bao gồm cả hai đầu. */
  from?: string
  to?: string
}

export type SupplierTransactionType = 'PURCHASE' | 'RETURN' | 'PAYMENT'

export const SUPPLIER_TRANSACTION_TYPES: readonly SupplierTransactionType[] = [
  'PURCHASE',
  'RETURN',
  'PAYMENT',
]

/** Sổ giao dịch với nhà cung cấp. Dòng PAYMENT không có vật tư/số lượng/đơn giá. */
export type SupplierTransaction = {
  slug: string
  createdAt: string
  updatedAt: string
  type: SupplierTransactionType
  materialSlug?: string | null
  materialCode?: string | null
  materialName?: string | null
  quantity?: number | null
  unitPrice?: number | null
  amount: number
  transactionDate: string
  note?: string | null
  performedBySlug?: string | null
  performedByName?: string | null
}

export type SupplierTransactionFilters = {
  type?: SupplierTransactionType
  materialSlug?: string
  /** ISO — dựng bằng `toTransactionRange`. */
  from?: string
  to?: string
}

/** PAYMENT không mang vật tư/số lượng/đơn giá (backend 101220); PURCHASE/RETURN không mang `amount`. */
export type SupplierTransactionInput =
  | {
      type: 'PURCHASE' | 'RETURN'
      materialSlug: string
      quantity: number
      unitPrice: number
      transactionDate?: string
      note?: string
    }
  | { type: 'PAYMENT'; amount: number; transactionDate?: string; note?: string }
