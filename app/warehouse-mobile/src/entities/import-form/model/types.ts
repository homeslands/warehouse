import type { Versioned } from '@/shared/api/types'

/** Vòng đời một chiều: `DRAFT` → `CONFIRMED` | `CANCELLED`. Chỉ `DRAFT` sửa / xác nhận được. */
export const IMPORT_FORM_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const
export type ImportFormStatus = (typeof IMPORT_FORM_STATUSES)[number]

/**
 * `ImportFormItemResponseDto`. Mã / tên vật tư, đơn vị, tỉ lệ quy đổi và NCC là snapshot lúc ghi
 * dòng. `baseQuantity = quantity × conversionRate`, `amount = quantity × unitPrice` — server tính.
 * Khác web: có `expiryDate` (web chưa khai).
 */
export type ImportFormItem = {
  slug: string
  createdAt: string
  updatedAt: string
  /** Đánh số từ 1. */
  lineNo: number
  materialSlug: string
  materialCode: string
  materialName: string
  unitSlug: string
  unitCode: string
  unitName: string
  supplierSlug: string | null
  supplierCode: string | null
  supplierName: string | null
  supplierTaxCode: string | null
  supplierAddress: string | null
  quantity: number
  conversionRate: number
  baseQuantity: number
  unitPrice: number
  amount: number
  note: string | null
  /** `YYYY-MM-DD`, không múi giờ. */
  expiryDate: string | null
}

/**
 * `ImportFormResponseDto`. `items` chỉ có ở `GET /{slug}` (danh sách bỏ hẳn field). `approver*` =
 * người xác nhận HOẶC huỷ. `requesterSlug` null khi user đã bị xoá.
 */
export type ImportForm = Versioned & {
  slug: string
  createdAt: string
  updatedAt: string
  code: string
  purchaseOrder: string | null
  invoiceCode: string
  requesterSlug: string | null
  requesterName: string
  approverSlug: string | null
  approverName: string | null
  /** `YYYY-MM-DD`, không múi giờ. */
  date: string
  total: number
  file: string | null
  note: string | null
  status: ImportFormStatus
  warehouseSlug: string
  items?: ImportFormItem[]
}

export type ImportFormItemInput = {
  materialSlug: string
  unitSlug: string
  quantity: number
  unitPrice: number
  note?: string
  /** Bên bán của dòng; bỏ qua = không ghi NCC. */
  supplierSlug?: string
  /** `YYYY-MM-DD` ≥ ngày phiếu. PATCH thay toàn bộ dòng: bỏ field = mất hạn dùng, nên luôn gửi (kể cả `null`). */
  expiryDate?: string | null
}

export type ImportFormInput = {
  code: string
  invoiceCode: string
  date: string
  purchaseOrder?: string
  file?: string
  note?: string
  items: ImportFormItemInput[]
}

/** PATCH gửi đủ header + toàn bộ `items` + `version` (như `toUpdateInput` của web). */
export type ImportFormUpdateInput = ImportFormInput & Versioned

/** Tìm theo tiền tố; BE không tìm gộp nên mỗi lần gửi một khoá. */
export type ImportFormSearchField = 'code' | 'invoiceCode' | 'purchaseOrder'

export type ImportFormFilters = {
  status?: ImportFormStatus
  field?: ImportFormSearchField
  query?: string
  /** Ngày tạo từ / đến (`YYYY-MM-DD`, tính cả hai đầu — `BaseQueryDto`). */
  startDate?: string
  endDate?: string
  /** Người lập / người xác nhận-huỷ (slug, khớp chính xác). */
  requesterSlug?: string
  approverSlug?: string
}

/** `conversionRate` = số đơn vị gốc trong 1 đơn vị này. */
export type AvailableUnit = {
  unitSlug: string
  unitCode: string
  unitName: string
  conversionRate: number
  isBaseUnit: boolean
}

export type AvailableSupplier = { slug: string; code: string; name: string }

/** Vật tư đã gán vào kho; `quantity` = tồn hiện tại (đơn vị gốc). */
export type AvailableMaterial = {
  slug: string
  code: string
  name: string
  baseUnitSlug: string | null
  quantity: number
  suppliers: AvailableSupplier[]
  units: AvailableUnit[]
}

/** Lựa chọn Bên bán khi tạo phiếu (cần `SUPPLIER_READ`). */
export type SupplierOption = { slug: string; code: string; name: string }
