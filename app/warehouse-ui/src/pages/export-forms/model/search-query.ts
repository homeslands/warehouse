import type { ExportFormFilters } from '@/entities/export-form'

export const EXPORT_FORM_SEARCH_FIELDS = ['code', 'invoiceCode', 'purchaseOrder'] as const
export type ExportFormSearchField = (typeof EXPORT_FORM_SEARCH_FIELDS)[number]

/** Độ dài tối đa BE nhận cho số hoá đơn / số PO. */
const MAX_REFERENCE_LENGTH = 64

/**
 * Một ô tìm, ba tham số BE (`code` / `invoiceCode` / `purchaseOrder`, đều khớp tiền tố, không phân biệt hoa thường) —
 * gửi đúng MỘT khoá theo `searchBy` (mặc định `code`). Luật chép từ phiếu nhập: `code` chỉ nhận `A-Z 0-9 _ -` nên làm
 * sạch + viết hoa; hai số chứng từ còn lại chỉ trim và cắt 64 ký tự. `symbolOnly`: có chữ nhưng làm sạch xong rỗng →
 * không gọi API (trang hiện trạng thái trống-do-lọc, không liệt kê cả danh sách).
 */
export function toExportFormSearchQuery(
  search: string | undefined,
  searchBy: ExportFormSearchField | undefined,
): {
  query: Pick<ExportFormFilters, ExportFormSearchField>
  symbolOnly: boolean
} {
  const raw = search?.trim() ?? ''
  if (raw === '') return { query: {}, symbolOnly: false }
  const field = searchBy ?? 'code'
  const value =
    field === 'code'
      ? raw.toUpperCase().replace(/[^A-Z0-9_-]/g, '')
      : raw.slice(0, MAX_REFERENCE_LENGTH).trim()
  if (value === '') return { query: {}, symbolOnly: true }
  return { query: { [field]: value }, symbolOnly: false }
}
