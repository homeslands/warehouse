import type { Versioned } from '@/shared/api/types'

/**
 * Vòng đời: `DRAFT` → `PENDING` (gửi duyệt, giữ chỗ tồn) → `CONFIRMED` (xuất kho) hoặc `CANCELLED`
 * (huỷ được từ `DRAFT` / `PENDING`). Chỉ `DRAFT` sửa / xoá được.
 */
export const EXPORT_FORM_STATUSES = ['DRAFT', 'PENDING', 'CONFIRMED', 'CANCELLED'] as const
export type ExportFormStatus = (typeof EXPORT_FORM_STATUSES)[number]

/** Lý do xuất kho (thứ tự hiển thị). */
export const EXPORT_FORM_TYPES = ['PRODUCTION', 'DISPOSAL', 'TRANSFER', 'SALE', 'OTHER'] as const
export type ExportFormType = (typeof EXPORT_FORM_TYPES)[number]

/**
 * `ExportFormItemResponseDto`. Mã / tên vật tư, đơn vị và tỉ lệ quy đổi là **snapshot** lúc ghi dòng.
 * `baseQuantity = quantity × conversionRate`, `amount = quantity × unitPrice` — server tính.
 * Gửi duyệt có thể tách một dòng thành nhiều dòng cùng vật tư khác lô (FEFO); `batchSlug` null khi
 * dòng nháp chưa chọn lô.
 */
export type ExportFormItem = {
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
  batchSlug: string | null
  /** `YYYY-MM-DD`; null khi lô không có hạn hoặc dòng chưa có lô. */
  batchExpiryDate: string | null
  quantity: number
  conversionRate: number
  baseQuantity: number
  unitPrice: number
  amount: number
  note: string | null
}

/**
 * `ExportFormResponseDto`. `items` chỉ có ở `GET /{slug}` (danh sách bỏ hẳn field). `approver*` = người
 * xác nhận HOẶC huỷ. `requesterSlug` null khi user đã bị xoá. `totalAmount` = Σ `amount` (server tính).
 */
export type ExportForm = Versioned & {
  slug: string
  createdAt: string
  updatedAt: string
  code: string
  type: ExportFormType
  status: ExportFormStatus
  purchaseOrder: string
  invoiceCode: string | null
  requesterSlug: string | null
  requesterName: string
  approverSlug: string | null
  approverName: string | null
  receiver: string
  totalAmount: number
  note: string | null
  file: string | null
  warehouseSlug: string
  items?: ExportFormItem[]
}

export type ExportFormItemInput = {
  materialSlug: string
  unitSlug: string
  quantity: number
  unitPrice: number
  note?: string
  /** Bỏ qua = khi gửi duyệt BE tự chọn lô theo FEFO (hạn dùng sớm nhất trước). */
  batchSlug?: string
}

export type ExportFormInput = {
  code: string
  type: ExportFormType
  purchaseOrder: string
  receiver: string
  invoiceCode?: string
  /** Link S3 do `uploadExportFormFile` trả về. */
  file?: string
  note?: string
  items: ExportFormItemInput[]
}

/** PATCH partial + `version` bắt buộc. Gửi `items` = thay TOÀN BỘ dòng. `''` = xoá giá trị cũ. */
export type ExportFormUpdateInput = Partial<ExportFormInput> & Versioned

export type ExportFormFilters = {
  status?: ExportFormStatus
  type?: ExportFormType
  /** Ngày tạo từ / đến, `YYYY-MM-DD`, tính cả hai đầu. `startDate` > `endDate` → 400. */
  startDate?: string
  endDate?: string
  /** Tìm theo tiền tố, không phân biệt hoa thường; BE không tìm gộp nên mỗi lần gửi một khoá. */
  code?: string
  invoiceCode?: string
  purchaseOrder?: string
  /** Khớp đúng slug người lập / người duyệt. */
  requesterSlug?: string
  approverSlug?: string
}
