/**
 * Mã nghiệp vụ (vật tư, loại vật tư, kho…): bản sao `BUSINESS_CODE_REGEX` của backend
 * (`app/warehouse-api/src/shared/utils/code.util.ts`) — 2–32 ký tự chữ Latin / số / gạch nối, không mở hay kết bằng
 * gạch. Backend tự `trim().toUpperCase()`.
 */
export const BUSINESS_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/

/** Mã đơn vị tính: như `BUSINESS_CODE_REGEX` nhưng cho phép 1 ký tự (`M`, `L`) — `UNIT_CODE_REGEX` của backend. */
export const UNIT_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])?$/

/**
 * Chuỗi người dùng gõ vào ô tìm "trông như mã" (mã NCC `NCC-HN-01`, mã vật tư `NL04`): một từ, chỉ chữ Latin / số /
 * gạch nối, có ít nhất một chữ và ít nhất một số hoặc gạch. Backend khớp mã ĐÚNG nên chỉ gửi `code` khi khá chắc;
 * chữ thường (`abc`) vẫn đi tìm theo tên.
 */
export function isCodeLike(value: string): boolean {
  return /^[A-Za-z0-9-]+$/.test(value) && /[A-Za-z]/.test(value) && /[\d-]/.test(value)
}

/** Cách tìm người dùng tự chọn khi phần đoán sai (`?searchBy=` trên URL). */
export type CodeOrNameField = 'code' | 'name'

/**
 * `toCodeOrNameQuery` rồi làm sạch theo đúng charset BE của `GET /materials` (sai → 100731 / 100732):
 * `name` chỉ giữ chữ (kể cả tiếng Việt), số, khoảng trắng; `code` viết hoa, chỉ `A-Z 0-9 _ -`.
 * Khoá rỗng sau khi làm sạch thì bỏ hẳn (không gửi).
 */
export function toMaterialSearchQuery(
  search: string | undefined,
  prefer?: CodeOrNameField,
): { code?: string; name?: string } {
  const query = toCodeOrNameQuery(search, prefer)
  const result: { code?: string; name?: string } = {}
  if (query.code !== undefined) {
    const code = query.code.toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    if (code !== '') result.code = code
  }
  if (query.name !== undefined) {
    const name = query.name
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (name !== '') result.name = name
  }
  return result
}

/** Một từ chỉ gồm chữ Latin / số / gạch nối — có thể là mã (để trang cho đổi sang "Tìm theo mã"). */
export function canSearchByCode(search: string | undefined): boolean {
  return /^[A-Za-z0-9-]+$/.test(search?.trim() ?? '')
}

/**
 * Một ô tìm, hai tham số backend (ghép AND nên không gửi chung). Đoán theo dạng nhập:
 * - trông như mã (`isCodeLike`: có số hoặc gạch, vd `mat-001`) HOẶC gõ toàn chữ hoa một từ (`KG`, `BAG`, `M` — mã
 *   đơn vị thường toàn chữ cái) → `code` viết hoa (khớp đúng);
 * - còn lại → `name` (chứa chuỗi).
 *
 * `prefer` (người dùng tự chọn) thắng phần đoán; `prefer = 'code'` bị bỏ qua khi chuỗi không thể là mã.
 */
export function toCodeOrNameQuery(
  search: string | undefined,
  prefer?: CodeOrNameField,
): { code?: string; name?: string } {
  const value = search?.trim() ?? ''
  if (value === '') return {}
  if (prefer === 'name') return { name: value }
  if (prefer === 'code' && canSearchByCode(value)) return { code: value.toUpperCase() }
  const looksLikeCode = isCodeLike(value) || /^[A-Z][A-Z0-9-]*$/.test(value)
  return looksLikeCode ? { code: value.toUpperCase() } : { name: value }
}
