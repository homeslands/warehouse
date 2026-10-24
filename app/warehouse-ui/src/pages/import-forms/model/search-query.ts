import type { ImportFormFilters } from '@/entities/import-form'

export const IMPORT_FORM_SEARCH_FIELDS = ['code', 'invoiceCode', 'purchaseOrder'] as const
export type ImportFormSearchField = (typeof IMPORT_FORM_SEARCH_FIELDS)[number]

/** Độ dài tối đa BE nhận cho số hoá đơn / số PO (vượt → 101308 / 101306). */
const MAX_REFERENCE_LENGTH = 64

/**
 * Một ô tìm, ba tham số BE (`code` / `invoiceCode` / `purchaseOrder`, đều khớp tiền tố) — gửi đúng MỘT khoá theo
 * `searchBy` (mặc định `code`). `code` chỉ nhận `A-Z 0-9 _ -` (ký tự khác → 400 / 101332) nên làm sạch + viết hoa;
 * hai số chứng từ còn lại chỉ trim và cắt 64 ký tự. `symbolOnly`: có chữ nhưng làm sạch xong rỗng → không gọi API
 * (trang hiện trạng thái trống-do-lọc, không liệt kê cả danh sách).
 */
export function toImportFormSearchQuery(
  search: string | undefined,
  searchBy: ImportFormSearchField | undefined,
): {
  query: Pick<ImportFormFilters, ImportFormSearchField>
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
