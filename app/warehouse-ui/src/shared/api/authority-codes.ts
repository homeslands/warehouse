/**
 * Mã quyền (`Authority.code`) mà FE dùng trong `can()` và `handle.authority`. Có kiểu để gõ sai là
 * lỗi biên dịch — không có danh sách này thì `can(user, 'WAREHOUSE_CREAT')` lặng lẽ trả `false`.
 *
 * Nguồn gốc: `app/warehouse-api/src/authority/authority.constants.ts` (đồng bộ 2026-09-30 với
 * `WMS-10-be(8)`, 64 mã). Danh sách là BẢN SAO nên có thể lệch: màn `/permissions` so với
 * `GET /authorities` và `console.warn` khi dev (`authorityCodeDrift`). Thấy cảnh báo thì sửa ở đây.
 *
 * Route nối hai tài nguyên KHÔNG có mã riêng — backend gắn `@RequireAuthority(A, B)` (AND), vd gán
 * kho cho cửa hàng = `STORE_UPDATE` + `WAREHOUSE_UPDATE`. FE gác bằng `can(A) && can(B)`.
 */
export const AUTHORITY_CODES = [
  // Hệ thống
  'EXAMPLE_CREATE',
  'EXAMPLE_UPDATE',
  'EXAMPLE_DELETE',
  'MANAGE_PERMISSIONS',
  'DB_BACKUP',
  'LOGGER_READ',
  // Vai trò (`WMS-10-be(5)`): `GET /roles` cần `ROLE_READ`
  'ROLE_CREATE',
  'ROLE_READ',
  'ROLE_UPDATE',
  'ROLE_DELETE',
  // Người dùng
  'USER_CREATE',
  'USER_READ',
  'USER_CHANGE_PASSWORD',
  // Phiếu nhập kho
  'IMPORT_FORM_CREATE',
  'IMPORT_FORM_READ',
  'IMPORT_FORM_UPDATE_DRAFT',
  'IMPORT_FORM_UPDATE_DRAFT_OWN',
  'IMPORT_FORM_DELETE_DRAFT',
  'IMPORT_FORM_DELETE_DRAFT_OWN',
  'IMPORT_FORM_CONFIRM',
  'IMPORT_FORM_EXPORT',
  // Phiếu xuất kho
  'EXPORT_FORM_CREATE',
  'EXPORT_FORM_READ',
  'EXPORT_FORM_UPDATE_DRAFT',
  'EXPORT_FORM_UPDATE_DRAFT_OWN',
  'EXPORT_FORM_DELETE_DRAFT',
  'EXPORT_FORM_DELETE_DRAFT_OWN',
  'EXPORT_FORM_CONFIRM',
  'EXPORT_FORM_EXPORT',
  'EXPORT_FORM_APPROVE_DISPOSAL',
  // Phiếu kiểm kho
  'BALANCE_FORM_CREATE',
  'BALANCE_FORM_READ',
  'BALANCE_FORM_READ_ASSIGNED',
  'BALANCE_FORM_RECORD_COUNT',
  'BALANCE_FORM_RECORD_COUNT_ASSIGNED',
  'BALANCE_FORM_COMPLETE',
  'BALANCE_FORM_COMPLETE_ASSIGNED',
  'BALANCE_FORM_APPROVE',
  // Phiếu chi kho
  'WAREHOUSE_PAYMENT_CREATE',
  'WAREHOUSE_PAYMENT_READ',
  'WAREHOUSE_PAYMENT_READ_OWN',
  'WAREHOUSE_PAYMENT_UPDATE_DRAFT',
  'WAREHOUSE_PAYMENT_UPDATE_DRAFT_OWN',
  'WAREHOUSE_PAYMENT_APPROVE',
  'WAREHOUSE_PAYMENT_EXPORT',
  // Kho
  'WAREHOUSE_CREATE',
  'WAREHOUSE_READ',
  'WAREHOUSE_UPDATE',
  'WAREHOUSE_DELETE',
  'WAREHOUSE_ASSIGN_MANAGER',
  // Đơn vị
  'UNIT_CREATE',
  'UNIT_READ',
  'UNIT_UPDATE',
  'UNIT_DELETE',
  // Vật tư — gồm cả loại vật tư; vật tư theo kho = MATERIAL_* + WAREHOUSE_*
  'MATERIAL_CREATE',
  'MATERIAL_READ',
  'MATERIAL_UPDATE',
  'MATERIAL_DELETE',
  // Cửa hàng
  'STORE_CREATE',
  'STORE_READ',
  'STORE_UPDATE',
  'STORE_DELETE',
  // Hồ sơ thuế
  'TAX_PROFILE_READ',
  'TAX_PROFILE_UPDATE',
] as const

export type AuthorityCode = (typeof AUTHORITY_CODES)[number]

const CODE_SET = new Set<string>(AUTHORITY_CODES)

/** Mã từ API (chuỗi tuỳ ý) có nằm trong danh sách FE biết không. */
export function isAuthorityCode(code: string): code is AuthorityCode {
  return CODE_SET.has(code)
}

/**
 * Mã chỉ SUPER_ADMIN cấp/gỡ được (R3 trong `docs/proposals/2026-09-25-permission-delegation-rules.md`).
 * Phải khớp `PROTECTED_AUTHORITY_CODES` của backend. Danh sách mặc định — nghiệp vụ có thể chốt lại.
 */
export const PROTECTED_AUTHORITY_CODES: readonly AuthorityCode[] = [
  'MANAGE_PERMISSIONS',
  'DB_BACKUP',
  'LOGGER_READ',
  'USER_CREATE',
  'USER_CHANGE_PASSWORD',
]

/**
 * So danh mục của backend với `AUTHORITY_CODES`. `unknown`: backend có mà FE chưa khai (không gác
 * được bằng `can()` cho tới khi thêm). `missing`: FE khai mà backend không có — `can()` với mã đó
 * luôn `false` với mọi người trừ SUPER_ADMIN.
 */
export function authorityCodeDrift(serverCodes: readonly string[]): {
  unknown: string[]
  missing: string[]
} {
  const known = new Set<string>(AUTHORITY_CODES)
  const server = new Set(serverCodes)
  return {
    unknown: serverCodes.filter((code) => !known.has(code)),
    missing: AUTHORITY_CODES.filter((code) => !server.has(code)),
  }
}
