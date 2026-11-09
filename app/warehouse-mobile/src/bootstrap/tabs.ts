import { can, type CurrentUser } from '@/entities/session'

export type TabKey = 'import' | 'export' | 'stock' | 'account'

/** Thứ tự cố định trên thanh tab (spec §4, hướng A). */
export const TAB_ORDER: readonly TabKey[] = ['import', 'export', 'stock', 'account']

/** Tab nghiệp vụ không có quyền đọc thì ẩn hẳn. `account` luôn có. */
const VISIBLE: Record<TabKey, (user: CurrentUser | null) => boolean> = {
  import: (user) => can(user, 'IMPORT_FORM_READ'),
  export: (user) => can(user, 'EXPORT_FORM_READ'),
  stock: (user) => can(user, 'MATERIAL_READ') && can(user, 'WAREHOUSE_READ'),
  account: () => true,
}

export function tabsFor(user: CurrentUser | null): TabKey[] {
  return TAB_ORDER.filter((tab) => VISIBLE[tab](user))
}

/** Không còn tab nghiệp vụ nào thì app không có gì để làm: màn "chưa được cấp quyền". */
export function hasBusinessTab(user: CurrentUser | null): boolean {
  return tabsFor(user).some((tab) => tab !== 'account')
}
