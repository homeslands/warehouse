import type { Versioned } from '@/shared/api/types'

/** `DRAFT` → `PENDING` (gửi duyệt, giữ chỗ tồn) → `CONFIRMED`; huỷ được từ `DRAFT` / `PENDING`. */
export const EXPORT_FORM_STATUSES = ['DRAFT', 'PENDING', 'CONFIRMED', 'CANCELLED'] as const
export type ExportFormStatus = (typeof EXPORT_FORM_STATUSES)[number]

/** Lý do xuất kho, theo thứ tự hiển thị. `DISPOSAL` cần thêm `EXPORT_FORM_APPROVE_DISPOSAL` để xác nhận. */
export const EXPORT_FORM_TYPES = ['PRODUCTION', 'SALE', 'TRANSFER', 'DISPOSAL', 'OTHER'] as const
export type ExportFormType = (typeof EXPORT_FORM_TYPES)[number]

/**
 * `ExportFormItemResponseDto`. Mã / tên vật tư và đơn vị là snapshot lúc ghi dòng.
 * `baseQuantity = quantity × conversionRate`, `amount = quantity × unitPrice` — server tính.
 * Dòng có thể được tách theo lô khi gửi duyệt (server giữ chỗ theo hạn gần nhất trước).
 */
export type ExportFormItem = {
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
  /** Lô đã chọn / đã giữ chỗ; null = chưa gán lô (server tự chọn hạn gần nhất khi gửi duyệt). */
  batchSlug: string | null
  /** `YYYY-MM-DD` của lô; null khi chưa gán lô hoặc lô không hạn. */
  batchExpiryDate: string | null
  quantity: number
  conversionRate: number
  baseQuantity: number
  unitPrice: number
  amount: number
  note: string | null
}

/**
 * `ExportFormResponseDto`. `items` chỉ có ở `GET /{slug}` (danh sách bỏ hẳn field). `approver*` =
 * người xác nhận HOẶC huỷ. `requesterSlug` null khi user đã bị xoá. Không có trường `date`: ngày
 * hiển thị là `createdAt`.
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
  /** Bỏ = server chọn lô hạn gần nhất trước khi gửi duyệt. */
  batchSlug?: string
  note?: string
}

export type ExportFormInput = {
  code: string
  type: ExportFormType
  purchaseOrder: string
  invoiceCode?: string
  receiver: string
  note?: string
  /** URL từ `upload-file`; `''` (chỉ PATCH) = gỡ chứng từ; bỏ = giữ nguyên. */
  file?: string
  items: ExportFormItemInput[]
}

/** PATCH gửi đủ header + toàn bộ `items` + `version`. */
export type ExportFormUpdateInput = ExportFormInput & Versioned

/** Tìm theo tiền tố; BE không tìm gộp nên mỗi lần gửi một khoá. */
export type ExportFormSearchField = 'code' | 'invoiceCode' | 'purchaseOrder'

export type ExportFormFilters = {
  status?: ExportFormStatus
  type?: ExportFormType
  field?: ExportFormSearchField
  query?: string
  /** Ngày tạo từ / đến (`YYYY-MM-DD`, tính cả hai đầu). */
  startDate?: string
  endDate?: string
  /** Người lập / người xác nhận-huỷ (slug, khớp chính xác). */
  requesterSlug?: string
  approverSlug?: string
}
