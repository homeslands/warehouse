import { can, type CurrentUser } from '@/entities/session'

export type TabKey = 'overview' | 'import' | 'export' | 'stock' | 'account'

/** Thứ tự cố định trên thanh tab: Tổng quan đầu tiên (tab mặc định), Tài khoản cuối. */
export const TAB_ORDER: readonly TabKey[] = ['overview', 'import', 'export', 'stock', 'account']

/** Tab "chỉ phụ trợ": luôn có / chỉ tóm tắt tab khác — không tính là tab nghiệp vụ. */
const NON_BUSINESS: readonly TabKey[] = ['overview', 'account']

const canImport = (user: CurrentUser | null) => can(user, 'IMPORT_FORM_READ')
const canExport = (user: CurrentUser | null) => can(user, 'EXPORT_FORM_READ')
const canStock = (user: CurrentUser | null) =>
  can(user, 'MATERIAL_READ') && can(user, 'WAREHOUSE_READ')

/** Tab nghiệp vụ không có quyền đọc thì ẩn hẳn; Tổng quan hiện khi còn ít nhất một tab nghiệp vụ. `account` luôn có. */
const VISIBLE: Record<TabKey, (user: CurrentUser | null) => boolean> = {
  overview: (user) => canImport(user) || canExport(user) || canStock(user),
  import: canImport,
  export: canExport,
  stock: canStock,
  account: () => true,
}

export function tabsFor(user: CurrentUser | null): TabKey[] {
  return TAB_ORDER.filter((tab) => VISIBLE[tab](user))
}

/** Không còn tab nghiệp vụ nào thì app không có gì để làm: màn "chưa được cấp quyền". */
export function hasBusinessTab(user: CurrentUser | null): boolean {
  return tabsFor(user).some((tab) => !NON_BUSINESS.includes(tab))
}
