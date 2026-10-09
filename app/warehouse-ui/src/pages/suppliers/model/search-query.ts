import { isCodeLike, type SupplierFilters } from '@/entities/supplier'

export type SupplierSearchField = 'search' | 'code' | 'taxCode' | 'phonenumber'
export type SupplierSearchQuery = Partial<Pick<SupplierFilters, SupplierSearchField>>
/** Hai cách hiểu của 10 chữ số — người dùng đổi được khi đoán sai (`?searchBy=` trên URL). */
export type SupplierDigitsField = 'taxCode' | 'phonenumber'

/** Đầu số di động VN (10 số). 10 chữ số mang đầu khác coi là MST — MST TP.HCM (03…) sẽ bị đoán nhầm thành SĐT. */
const MOBILE_PREFIX = /^0[35789]/

/**
 * Một ô tìm, bốn tham số backend (`GET /suppliers` ghép AND nên không gửi chung được). Đoán theo dạng nhập:
 * - toàn chữ số (bỏ khoảng trắng / chấm / gạch): 13 số → `taxCode` dạng `xxxxxxxxxx-xxx`; 10 số không mang
 *   đầu số di động → `taxCode`; còn lại → `phonenumber` (backend khớp chứa chuỗi).
 * - một từ có cả chữ lẫn số, hoặc có gạch nối (`NCC3`, `ncc-hn-01`) → `code` viết hoa (backend khớp đúng).
 * - còn lại → `search` (tên / người liên hệ / email).
 *
 * 10 chữ số là MST hay SĐT đều được (MST TP.HCM 03… trùng đầu số Viettel) — `prefer` (người dùng tự chọn)
 * thắng phần đoán; với dạng nhập khác thì `prefer` bị bỏ qua. Đoán sai thì danh sách trống — trang ghi rõ đã
 * tìm theo trường nào và (với 10 chữ số) cho đổi sang trường kia.
 */
export function toSupplierSearchQuery(
  search: string | undefined,
  prefer?: SupplierDigitsField,
): SupplierSearchQuery {
  const value = search?.trim() ?? ''
  if (value === '') return {}

  const digits = value.replace(/[\s.-]/g, '')
  if (/^\d+$/.test(digits)) {
    if (digits.length === 13) return { taxCode: `${digits.slice(0, 10)}-${digits.slice(10)}` }
    if (digits.length === 10) {
      const field = prefer ?? (MOBILE_PREFIX.test(digits) ? 'phonenumber' : 'taxCode')
      return { [field]: digits }
    }
    return { phonenumber: digits }
  }

  if (isCodeLike(value)) {
    return { code: value.toUpperCase() }
  }

  return { search: value }
}

/** Ô tìm là đúng 10 chữ số (bỏ khoảng trắng / chấm / gạch) — hiểu được cả MST lẫn SĐT. */
export function isAmbiguousSupplierSearch(search: string | undefined): boolean {
  return /^\d{10}$/.test((search ?? '').replace(/[\s.-]/g, ''))
}

/** Tham số `toSupplierSearchQuery` đã chọn — để báo "không tìm thấy theo <trường>". */
export function supplierSearchField(query: SupplierSearchQuery): SupplierSearchField | undefined {
  return (Object.keys(query) as SupplierSearchField[])[0]
}
