import type { Versioned } from '@/shared/api/types'

/** Vòng đời một chiều: `DRAFT` → `CONFIRMED` | `CANCELLED`. Chỉ `DRAFT` sửa / xoá được. */
export const IMPORT_FORM_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const
export type ImportFormStatus = (typeof IMPORT_FORM_STATUSES)[number]

/**
 * `ImportFormItemResponseDto`. Mã / tên vật tư, đơn vị, tỉ lệ quy đổi và NCC là **snapshot** lúc ghi dòng.
 * `baseQuantity = quantity × conversionRate`, `amount = quantity × unitPrice` — server tính.
 */
export type ImportFormItem = {
  slug: string
  createdAt: string
  updatedAt: string
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
  /** `YYYY-MM-DD`; không có = hàng không theo dõi hạn. */
  expiryDate: string | null
  note: string | null
}

/**
 * `ImportFormResponseDto`. `items` chỉ có ở `GET /{slug}` (danh sách bỏ hẳn field). `approver*` = người xác nhận
 * HOẶC huỷ. `requesterSlug` null khi user đã bị xoá. Phiếu không có field nhà cung cấp.
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
  /** `YYYY-MM-DD`, không trước ngày phiếu; bỏ qua = không có hạn. */
  expiryDate?: string
  /** Bên bán của dòng; bỏ qua = không ghi NCC. */
  supplierSlug?: string
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

/** PATCH partial + `version` bắt buộc. Gửi `items` = thay TOÀN BỘ dòng. `''` = xoá giá trị cũ. */
export type ImportFormUpdateInput = Partial<ImportFormInput> & Versioned

export type ImportFormFilters = {
  status?: ImportFormStatus
  /** Ngày tạo từ / đến, `YYYY-MM-DD`, tính cả hai đầu. `startDate` > `endDate` → 400. */
  startDate?: string
  endDate?: string
  /** Tìm theo tiền tố, không phân biệt hoa thường; BE không tìm gộp nên mỗi lần gửi một khoá. */
  code?: string
  invoiceCode?: string
  purchaseOrder?: string
  /** Khớp đúng slug người lập / người xác nhận. */
  requesterSlug?: string
  approverSlug?: string
}

/** `ImportFormAvailableUnitResponseDto`. `conversionRate` = số đơn vị gốc trong 1 đơn vị này. */
export type AvailableUnit = {
  unitSlug: string
  unitCode: string
  unitName: string
  conversionRate: number
  isBaseUnit: boolean
}

/** NCC đã gán cho vật tư trong `ImportFormAvailableMaterialResponseDto.suppliers`. */
export type AvailableSupplier = { slug: string; code: string; name: string }

/** `ImportFormAvailableMaterialResponseDto` — vật tư đã gán vào kho, `quantity` = tồn hiện tại (đơn vị gốc). */
export type AvailableMaterial = {
  slug: string
  code: string
  name: string
  baseUnitSlug: string | null
  quantity: number
  suppliers: AvailableSupplier[]
  units: AvailableUnit[]
  /** BE chưa trả — khai tuỳ chọn để cảnh báo "tồn vượt max" tự bật khi có (spec §6). */
  effectiveMaximumInventory?: number
}
